import { useEffect, useMemo, useCallback, useState } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, useReactFlow, BackgroundVariant, MarkerType } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '../../store/useStore';
import { CustomTableNode } from './CustomTableNode';
import { CustomTableEdge } from './CustomTableEdge';
import { CustomColumnEdge } from './CustomColumnEdge';
import { MergeTablesDialog } from '../MergeTablesDialog';
import { getLayoutedElements } from '../../lib/layout';
import { previewVisibleColumns } from '../../lib/columnPreview';
import { Button } from '../ui/button';
import { GitMerge } from 'lucide-react';
import type { System, TableEdge, ColumnEdge } from '../../types/models';

const nodeTypes = { tableNode: CustomTableNode as any };
const edgeTypes = { tableEdge: CustomTableEdge as any, columnEdge: CustomColumnEdge as any };

// Pans/centers the viewport on the focused node whenever the column focus changes,
// so re-rooting the trace on a downstream/upstream column brings it into view.
function FocusCentering({ focusId }: { focusId: string | null }) {
  const { getNode, getZoom, setCenter } = useReactFlow();
  useEffect(() => {
    if (!focusId) return;
    const node = getNode(focusId);
    if (!node) return;
    const w = (node.measured?.width ?? node.width ?? 280);
    const h = (node.measured?.height ?? node.height ?? 120);
    setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: getZoom(), duration: 500 });
  }, [focusId, getNode, getZoom, setCenter]);
  return null;
}

interface SystemCanvasProps {
  system: System;
}

function SystemCanvas({ system }: SystemCanvasProps) {
  const storeNodes = useStore(state => state.nodes);
  const storeTableEdges = useStore(state => state.tableEdges);
  const storeColumnEdges = useStore(state => state.columnEdges);
  const activeCanvasId = useStore(state => state.activeCanvasId);

  const columnFocus = useStore(state => state.columnFocus);
  const tracedColumns = useStore(state => state.tracedColumns);
  const clearColumnFocus = useStore(state => state.clearColumnFocus);

  const updateTableNodePosition = useStore(state => state.updateTableNodePosition);
  const updateTableNodePositions = useStore(state => state.updateTableNodePositions);

  const addTableEdge = useStore(state => state.addTableEdge);
  const addColumnEdge = useStore(state => state.addColumnEdge);
  const deleteTableEdge = useStore(state => state.deleteTableEdge);
  const deleteColumnEdge = useStore(state => state.deleteColumnEdge);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  // When a connector is clicked we highlight just the two tables it directly
  // connects (and the connector itself), dimming the rest.
  const [lineage, setLineage] = useState<{ nodes: Set<string>; edges: Set<string> } | null>(null);
  // Tables the user manually expanded via "+N more". Lifted out of the node so
  // the edge resolver can anchor their now-visible columns to real handles.
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  const onToggleColumns = useCallback((id: string, expanded: boolean) => {
    setExpandedNodeIds(prev => {
      const next = new Set(prev);
      if (expanded) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const onSelectionChange = useCallback((params: any) => {
    setSelectedNodeIds((params.nodes ?? []).map((n: any) => n.id));
  }, []);

  const onEdgeClick = useCallback((_event: any, clicked: Edge) => {
    setLineage({
      nodes: new Set<string>([clicked.source, clicked.target]),
      edges: new Set<string>([clicked.id]),
    });
  }, []);

  // Clicking empty canvas returns everything to normal.
  const onPaneClick = useCallback(() => setLineage(null), []);

  // A connector highlight only makes sense for the edges currently rendered;
  // entering/leaving column-focus mode rebuilds them, so drop the highlight.
  useEffect(() => { setLineage(null); }, [columnFocus]);

  // Re-derive nodes/edges with highlight + dimming applied. Returns the originals
  // untouched when nothing is highlighted.
  const displayNodes = useMemo(() => {
    if (!lineage) return nodes;
    return nodes.map(n => lineage.nodes.has(n.id)
      ? { ...n, data: { ...(n.data as any), lineageHighlight: true } }
      : { ...n, style: { ...(n.style as any), opacity: 0.3 } });
  }, [nodes, lineage]);

  const displayEdges = useMemo(() => {
    if (!lineage) return edges;
    return edges.map(e => lineage.edges.has(e.id)
      ? { ...e, animated: true, zIndex: 1000, data: { ...(e.data as any), lineageHighlight: true } }
      // Drop the arrowhead on dimmed edges so faded lines don't keep solid markers.
      : { ...e, markerEnd: undefined, data: { ...(e.data as any), lineageDimmed: true } });
  }, [edges, lineage]);

  // The store already holds only the active canvas's data; filter to this system tab.
  const systemNodes = useMemo(() => {
    return Object.values(storeNodes).filter(n => n.system === system);
  }, [storeNodes, system]);

  const systemTableEdges = useMemo(() => {
    return Object.values(storeTableEdges).filter(e => {
      const fromNode = storeNodes[e.fromDataset];
      const toNode = storeNodes[e.toDataset];
      return fromNode?.system === system && toNode?.system === system;
    });
  }, [storeTableEdges, storeNodes, system]);

  const systemColumnEdges = useMemo(() => {
    return Object.values(storeColumnEdges).filter(e => {
      const targetNode = storeNodes[e.target.datasetId];
      return targetNode?.system === system;
    });
  }, [storeColumnEdges, storeNodes, system]);

  // datasetId -> set of its columns that take part in any column edge. Used to
  // prioritize connected columns in the preview and to decide handle anchoring.
  const connectedColumnsByNode = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    const add = (datasetId: string, column: string) => {
      (map[datasetId] ??= new Set<string>()).add(column);
    };
    for (const e of systemColumnEdges) {
      add(e.target.datasetId, e.target.column);
      for (const src of e.sources) add(src.datasetId, src.column);
    }
    return map;
  }, [systemColumnEdges]);

  const initialNodes = useMemo(() => {
    const placedNodes: any[] = [];
    const withConnected = (node: any) => ({
      ...node,
      connectedColumns: [...(connectedColumnsByNode[node.datasetId] ?? [])],
      onToggleColumns,
    });

    // First place all nodes that already have a position in the store
    for (const node of systemNodes) {
      if (node.position) {
        placedNodes.push({
          id: node.datasetId,
          type: 'tableNode',
          position: node.position,
          data: withConnected(node),
        });
      }
    }

    // Sequentially compute positions for nodes that don't have one
    for (const node of systemNodes) {
      if (!node.position) {
        const laneNodes = placedNodes;
        let posX = 100;
        let posY = 100;

        if (laneNodes.length > 0) {
          let maxX = 100;
          let sumY = 0;
          for (const ln of laneNodes) {
            if (ln.position.x > maxX) maxX = ln.position.x;
            sumY += ln.position.y;
          }
          posX = maxX + 320;
          posY = Math.round(sumY / laneNodes.length);
        }

        const newNode = {
          id: node.datasetId,
          type: 'tableNode',
          position: { x: posX, y: posY },
          data: withConnected(node),
        };
        placedNodes.push(newNode);
      }
    }

    return placedNodes;
  }, [systemNodes, connectedColumnsByNode, onToggleColumns]);

  const initialEdges = useMemo(() => {
    const isFocusMode = !!columnFocus;
    const isTraced = (datasetId: string, column: string) =>
      !!tracedColumns[datasetId]?.includes(column);

    // Nodes that render every column — either expanded by a clicked connector or
    // manually via "+N more" — can anchor their edges to the precise column handle.
    const expandedNodes = new Set<string>([...(lineage?.nodes ?? []), ...expandedNodeIds]);
    const previewCache: Record<string, Set<string>> = {};
    const previewVisible = (datasetId: string) => {
      if (!previewCache[datasetId]) {
        const cols = (storeNodes[datasetId]?.columns ?? []).map((c: any) => c.name);
        previewCache[datasetId] = previewVisibleColumns(cols, connectedColumnsByNode[datasetId] ?? new Set());
      }
      return previewCache[datasetId];
    };
    // Pick the column handle when the column is actually shown, otherwise fall
    // back to the table-level handle so the connection is never dropped.
    const resolveHandle = (datasetId: string, column: string, kind: 'source' | 'target') => {
      const tableHandle = kind === 'source' ? 'table-source' : 'table-target';
      if (storeNodes[datasetId]?.collapsed) return tableHandle;
      const shown = expandedNodes.has(datasetId) || previewVisible(datasetId).has(column);
      return shown ? `col-${column}-${kind}` : tableHandle;
    };

    // While tracing a column's lineage, hide table-level edges so only the
    // column lineage is shown.
    const tableFlowEdges: Edge[] = isFocusMode ? [] : systemTableEdges.map(e => ({
      id: e.edgeId,
      source: e.fromDataset,
      target: e.toDataset,
      sourceHandle: 'table-source',
      targetHandle: 'table-target',
      type: 'tableEdge',
      // Arrowhead points source -> target so the data-flow direction is visible.
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#94a3b8' },
      data: e as any,
    }));

    const columnFlowEdges: Edge[] = systemColumnEdges.flatMap(e =>
      // Only render sources that live in this system tab; a cross-system source
      // (e.g. a LEGACY column feeding a TARGET column) has no node here, and an
      // edge pointing at a missing node makes React Flow / ELK thrash.
      e.sources
        .filter(src => storeNodes[src.datasetId]?.system === system)
        // In focus mode only keep edges whose endpoints are both on the lineage.
        .filter(src => !isFocusMode || (isTraced(src.datasetId, src.column) && isTraced(e.target.datasetId, e.target.column)))
        .map((src, i) => {
          const isUnknown = e.transformationType === 'UNKNOWN';
          // In focus mode every traced node renders its columns, so always anchor
          // to the column handles; otherwise route through the preview-aware
          // resolver that falls back to the table handle for hidden columns.
          const sourceHandle = isFocusMode ? `col-${src.column}-source` : resolveHandle(src.datasetId, src.column, 'source');
          const targetHandle = isFocusMode ? `col-${e.target.column}-target` : resolveHandle(e.target.datasetId, e.target.column, 'target');
          return {
            id: `${e.edgeId}-${i}`,
            source: src.datasetId,
            target: e.target.datasetId,
            sourceHandle,
            targetHandle,
            type: 'columnEdge',
            animated: isFocusMode,
            // Arrowhead points source -> target (upstream column feeds downstream).
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: isUnknown ? '#9ca3af' : '#60a5fa' },
            data: e as any,
          };
        })
    );

    return [...tableFlowEdges, ...columnFlowEdges];
  }, [systemTableEdges, systemColumnEdges, storeNodes, columnFocus, tracedColumns, system, connectedColumnsByNode, lineage, expandedNodeIds]);

  useEffect(() => {
    setNodes(initialNodes as any);
    setEdges(initialEdges as any);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onLayout = useCallback(async () => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes as any);
    setEdges(layoutedEdges as any);

    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of layoutedNodes) {
      if (n.position) {
        positions[n.id] = n.position;
      }
    }
    await updateTableNodePositions(positions);
  }, [nodes, edges, setNodes, setEdges, updateTableNodePositions]);

  // Auto layout on mount if no nodes have a position in the store
  useEffect(() => {
    const hasAnyPosition = systemNodes.some(n => n.position);
    if (systemNodes.length > 0 && !hasAnyPosition) {
      onLayout();
    }
  }, [systemNodes, onLayout]);

  const onNodeDragStop = useCallback(async (_event: any, node: any) => {
    await updateTableNodePosition(node.id, node.position);
  }, [updateTableNodePosition]);

  // Persist edge deletions to the store. The rendered edges are derived from the
  // store on every node move / re-render, so deleting only React Flow's local
  // state would let the edge reappear. Removing it from the store makes it stick.
  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const edge of deleted) {
      // Both edge types carry their underlying store record in `data`; fall back
      // to the flow id for table edges whose id equals the store edgeId.
      const storeEdgeId = (edge.data as any)?.edgeId ?? edge.id;
      if (edge.type === 'columnEdge') {
        await deleteColumnEdge(storeEdgeId);
      } else {
        await deleteTableEdge(storeEdgeId);
      }
    }
  }, [deleteTableEdge, deleteColumnEdge]);

  const onConnect = useCallback(async (params: any) => {
    const { source, target, sourceHandle, targetHandle } = params;
    if (!source || !target || !sourceHandle || !targetHandle || !activeCanvasId) return;

    if (sourceHandle === 'table-source' && targetHandle === 'table-target') {
      const edgeId = `TE|${source}|${target}|MANUAL`;
      const tableEdge: TableEdge = {
        edgeId,
        canvasId: activeCanvasId,
        uploadId: 'MANUAL',
        fromDataset: source,
        toDataset: target,
        processId: 'MANUAL',
      };
      await addTableEdge(tableEdge);
    } else if (sourceHandle.startsWith('col-') && targetHandle.startsWith('col-')) {
      const sourceCol = sourceHandle.replace('col-', '').replace('-source', '');
      const targetCol = targetHandle.replace('col-', '').replace('-target', '');
      const edgeId = `CE|${target}::${targetCol}|${source}::${sourceCol}|MANUAL`;
      const columnEdge: ColumnEdge = {
        edgeId,
        canvasId: activeCanvasId,
        uploadId: 'MANUAL',
        target: { datasetId: target, column: targetCol },
        sources: [{ datasetId: source, column: sourceCol }],
        processId: 'MANUAL',
        transformationType: 'DIRECT',
        confidence: 'HIGH',
      };
      await addColumnEdge(columnEdge);
    }
  }, [addTableEdge, addColumnEdge, activeCanvasId]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#cbd5e1" />
        <Controls />
        <FocusCentering focusId={columnFocus?.datasetId ?? null} />
      </ReactFlow>

      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        {selectedNodeIds.length >= 2 && (
          <Button onClick={() => setMergeOpen(true)} variant="default" size="sm" className="shadow-sm">
            <GitMerge size={13} className="mr-1" /> Merge {selectedNodeIds.length} tables
          </Button>
        )}
        <Button onClick={onLayout} variant="secondary" size="sm" className="shadow-sm border">
          Auto Layout
        </Button>
      </div>

      <MergeTablesDialog
        open={mergeOpen}
        onOpenChange={(o) => setMergeOpen(o)}
        sources={selectedNodeIds.map(id => storeNodes[id]).filter((n): n is NonNullable<typeof n> => !!n)}
      />

      {columnFocus && (
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 shadow-sm">
          <span className="text-xs text-blue-900">
            Tracing lineage for <span className="font-mono font-semibold">{columnFocus.column}</span>
          </span>
          <Button onClick={() => clearColumnFocus()} variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-700 hover:bg-blue-100">
            Exit
          </Button>
        </div>
      )}
    </div>
  );
}

export function LineageGraph() {
  const activeCanvasId = useStore(state => state.activeCanvasId);
  const activeSystemTab = useStore(state => state.activeSystemTab);
  const setActiveSystemTab = useStore(state => state.setActiveSystemTab);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);

  if (!activeCanvasId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center text-slate-400">
        <div>
          <p className="text-sm font-medium">No canvas selected</p>
          <p className="text-xs mt-1">Create or pick a project and canvas from the sidebar to begin.</p>
        </div>
      </div>
    );
  }

  const legacyLabel = project?.legacySystemName || 'Legacy';
  const targetLabel = project?.targetSystemName || 'Target';

  const tabBtn = (system: System, label: string) => (
    <button
      onClick={() => setActiveSystemTab(system)}
      className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        activeSystemTab === system
          ? 'border-primary text-primary'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-400">
        {system === 'LEGACY' ? 'Legacy' : 'Target'}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center gap-1 border-b bg-background px-3 shrink-0">
        {tabBtn('LEGACY', legacyLabel)}
        {tabBtn('TARGET', targetLabel)}
      </div>
      <div className="flex-1 relative">
        {/* key forces a fresh ReactFlow instance per system tab so positions/fitView reset cleanly */}
        <SystemCanvas key={`${activeCanvasId}:${activeSystemTab}`} system={activeSystemTab} />
      </div>
    </div>
  );
}
