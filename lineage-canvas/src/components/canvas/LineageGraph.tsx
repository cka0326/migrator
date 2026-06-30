import { useEffect, useMemo, useCallback, useState } from 'react';
import { ReactFlow, Controls, Background, MiniMap, Panel, useNodesState, useEdgesState, useReactFlow, BackgroundVariant, MarkerType } from '@xyflow/react';
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
import { GitMerge, Search } from 'lucide-react';
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

// Jump-to-table search for large graphs: type a name, pick a result, and the
// viewport recenters on that table (and opens its details). Rendered inside
// ReactFlow so it can drive the viewport via useReactFlow.
function NodeSearch({ system }: { system: System }) {
  const { getNode, setCenter, getZoom } = useReactFlow();
  const storeNodes = useStore(state => state.nodes);
  const selectNode = useStore(state => state.selectNode);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(storeNodes)
      .filter(n => n.system === system)
      .filter(n => n.name.toLowerCase().includes(q) || (n.namespace ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [query, storeNodes, system]);

  const jumpTo = (datasetId: string) => {
    const node = getNode(datasetId);
    if (node) {
      const w = (node.measured?.width ?? node.width ?? 280);
      const h = (node.measured?.height ?? node.height ?? 120);
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: Math.max(getZoom(), 1), duration: 600 });
    }
    selectNode(datasetId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="w-64">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Find a table…"
          className="w-full rounded-md border bg-white pl-7 pr-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) {
              jumpTo(results[0].datasetId);
              e.preventDefault();
            } else if (e.key === 'Escape') {
              // Clear the search; stop the global Esc stack from also firing.
              setQuery('');
              setOpen(false);
              (e.target as HTMLInputElement).blur();
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded-md border bg-white shadow-md nowheel">
          {results.map(n => (
            <button
              key={n.datasetId}
              onClick={() => jumpTo(n.datasetId)}
              className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-muted/60 border-b last:border-0"
            >
              <span className="text-xs font-medium truncate w-full">{n.name}</span>
              {n.namespace && <span className="text-[10px] text-muted-foreground truncate w-full">{n.namespace}</span>}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() !== '' && results.length === 0 && (
        <div className="mt-1 rounded-md border bg-white px-2 py-1.5 text-xs text-muted-foreground shadow-md">
          No tables match “{query}”.
        </div>
      )}
    </div>
  );
}

// Arrow keys pan the viewport so the graph is navigable without a mouse.
// Rendered inside ReactFlow for viewport access. Ignored while typing or when a
// node is focused (so React Flow's own node-move keys still work).
function ArrowKeyPan() {
  const { getViewport, setViewport } = useReactFlow();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable || ae.closest('.react-flow__node'))) return;

      const step = e.shiftKey ? 240 : 80; // Shift pans faster
      const vp = getViewport();
      // Move the camera in the arrow's direction (content shifts the other way).
      const x = vp.x + (e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0);
      const y = vp.y + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0);
      setViewport({ x, y, zoom: vp.zoom });
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [getViewport, setViewport]);
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

  // Double-clicking a table focuses its hub: highlight it and every directly-
  // connected table (expanding them to show all columns and re-anchoring the
  // spoke connections to real handles), and dim everything else — the same
  // focus treatment as column-lineage tracing. Double-clicking the same hub
  // toggles back; a pane click or Esc also clears it.
  const onNodeDoubleClick = useCallback((_event: any, node: any) => {
    const groupNodes = new Set<string>([node.id]);
    const groupEdges = new Set<string>();
    for (const e of edges) {
      if (e.source === node.id || e.target === node.id) {
        groupEdges.add(e.id);
        groupNodes.add(e.source);
        groupNodes.add(e.target);
      }
    }
    setLineage(prev => {
      if (prev && prev.nodes.size === groupNodes.size && [...groupNodes].every(id => prev.nodes.has(id))) {
        return null;
      }
      return { nodes: groupNodes, edges: groupEdges };
    });
  }, [edges]);

  // A connector highlight only makes sense for the edges currently rendered;
  // entering/leaving column-focus mode rebuilds them, so drop the highlight.
  useEffect(() => { setLineage(null); }, [columnFocus]);

  // Esc clears the connector selection — but only as the last level. Effects run
  // child-before-parent, so we can't rely on the global App handler running
  // first; instead we defer explicitly whenever any higher level (a details
  // panel or column focus) is still active, keeping the priority deterministic.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !lineage) return;
      const s = useStore.getState();
      if (s.selectedColumn || s.selectedNodeId || s.columnFocus) return;
      setLineage(null);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lineage]);

  // Re-derive nodes/edges with highlight + dimming + forced expansion applied.
  // Returns the originals (stable refs) for nodes that need none of it.
  const displayNodes = useMemo(() => {
    if (!lineage && expandedNodeIds.size === 0) return nodes;
    return nodes.map(n => {
      const expanded = expandedNodeIds.has(n.id);
      const highlight = !!lineage && lineage.nodes.has(n.id);
      const dim = !!lineage && !lineage.nodes.has(n.id);
      if (!expanded && !highlight && !dim) return n;
      const data: any = { ...(n.data as any) };
      if (expanded) data.forceExpanded = true;
      if (highlight) data.lineageHighlight = true;
      return dim ? { ...n, data, style: { ...(n.style as any), opacity: 0.3 } } : { ...n, data };
    });
  }, [nodes, lineage, expandedNodeIds]);

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
        onNodeDoubleClick={onNodeDoubleClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        zoomOnDoubleClick={false}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Graph minimap"
          nodeStrokeWidth={2}
          nodeColor={(n) => ((n.data as any)?.system === 'LEGACY' ? '#93c5fd' : '#c4b5fd')}
        />
        <FocusCentering focusId={columnFocus?.datasetId ?? null} />
        <ArrowKeyPan />
        <Panel position="top-left">
          <div className="flex flex-col gap-2">
            <NodeSearch system={system} />
            {columnFocus && (
              <div className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 shadow-sm">
                <span className="text-xs text-blue-900">
                  Tracing lineage for <span className="font-mono font-semibold">{columnFocus.column}</span>
                </span>
                <Button onClick={() => clearColumnFocus()} variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-700 hover:bg-blue-100">
                  Exit
                </Button>
              </div>
            )}
          </div>
        </Panel>
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
