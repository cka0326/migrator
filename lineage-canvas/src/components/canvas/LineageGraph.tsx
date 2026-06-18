import { useEffect, useMemo, useCallback } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, BackgroundVariant } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '../../store/useStore';
import { CustomTableNode } from './CustomTableNode';
import { CustomTableEdge } from './CustomTableEdge';
import { CustomColumnEdge } from './CustomColumnEdge';
import { getLayoutedElements } from '../../lib/layout';
import { Button } from '../ui/button';
import type { System, TableEdge, ColumnEdge } from '../../types/models';

const nodeTypes = { tableNode: CustomTableNode as any };
const edgeTypes = { tableEdge: CustomTableEdge as any, columnEdge: CustomColumnEdge as any };

interface SystemCanvasProps {
  system: System;
  title: string;
  bgColor: string;
  dotColor: string;
}

function SystemCanvas({ system, title, bgColor, dotColor }: SystemCanvasProps) {
  const storeNodes = useStore(state => state.nodes);
  const storeTableEdges = useStore(state => state.tableEdges);
  const storeColumnEdges = useStore(state => state.columnEdges);
  
  const updateTableNodePosition = useStore(state => state.updateTableNodePosition);
  const updateTableNodePositions = useStore(state => state.updateTableNodePositions);
  
  const addTableEdge = useStore(state => state.addTableEdge);
  const addColumnEdge = useStore(state => state.addColumnEdge);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Filter nodes & edges for this system
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

  const initialNodes = useMemo(() => {
    const placedNodes: any[] = [];
    
    // First place all nodes that already have a position in the store
    for (const node of systemNodes) {
      if (node.position) {
        placedNodes.push({
          id: node.datasetId,
          type: 'tableNode',
          position: node.position,
          data: node,
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
          data: node,
        };
        placedNodes.push(newNode);
      }
    }
    
    return placedNodes;
  }, [systemNodes]);

  const initialEdges = useMemo(() => {
    const tableFlowEdges: Edge[] = systemTableEdges.map(e => ({
      id: e.edgeId,
      source: e.fromDataset,
      target: e.toDataset,
      sourceHandle: 'table-source',
      targetHandle: 'table-target',
      type: 'tableEdge',
      data: e as any,
    }));

    const columnFlowEdges: Edge[] = systemColumnEdges.flatMap(e => 
      e.sources.map((src, i) => {
        const isSourceCollapsed = storeNodes[src.datasetId]?.collapsed;
        const isTargetCollapsed = storeNodes[e.target.datasetId]?.collapsed;
        return {
          id: `${e.edgeId}-${i}`,
          source: src.datasetId,
          target: e.target.datasetId,
          sourceHandle: isSourceCollapsed ? 'table-source' : `col-${src.column}-source`,
          targetHandle: isTargetCollapsed ? 'table-target' : `col-${e.target.column}-target`,
          type: 'columnEdge',
          data: e as any,
        };
      })
    );

    return [...tableFlowEdges, ...columnFlowEdges];
  }, [systemTableEdges, systemColumnEdges, storeNodes]);

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

  const onConnect = useCallback(async (params: any) => {
    const { source, target, sourceHandle, targetHandle } = params;
    if (!source || !target || !sourceHandle || !targetHandle) return;

    if (sourceHandle === 'table-source' && targetHandle === 'table-target') {
      const edgeId = `TE|${source}|${target}|MANUAL`;
      const tableEdge: TableEdge = {
        edgeId,
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
        uploadId: 'MANUAL',
        target: { datasetId: target, column: targetCol },
        sources: [{ datasetId: source, column: sourceCol }],
        processId: 'MANUAL',
        transformationType: 'DIRECT',
        confidence: 'HIGH',
      };
      await addColumnEdge(columnEdge);
    }
  }, [addTableEdge, addColumnEdge]);

  const titleStyle = system === 'SAS' 
    ? "bg-blue-100 text-blue-900 border-blue-200" 
    : "bg-teal-100 text-teal-900 border-teal-200";

  return (
    <div className={`w-full h-full relative ${bgColor}`}>
      <div className={`absolute top-3 left-4 z-10 font-bold px-3 py-1.5 rounded-md text-xs tracking-wider uppercase shadow-sm border select-none pointer-events-none ${titleStyle}`}>
        {title}
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color={dotColor} />
        <Controls />
      </ReactFlow>

      <div className="absolute top-3 right-4 z-10">
        <Button onClick={onLayout} variant="secondary" size="sm" className="shadow-sm border">
          Auto Layout
        </Button>
      </div>
    </div>
  );
}

export function LineageGraph() {
  return (
    <div className="flex flex-col h-full w-full">
      {/* SAS Canvas */}
      <div className="flex-1 relative h-1/2 border-b-2 border-slate-200">
        <SystemCanvas 
          system="SAS" 
          title="SAS Source System (Legacy)" 
          bgColor="bg-blue-50/10" 
          dotColor="#3b82f6" 
        />
      </div>
      {/* Snowflake Canvas */}
      <div className="flex-1 relative h-1/2">
        <SystemCanvas 
          system="SNOWFLAKE" 
          title="Snowflake Target System" 
          bgColor="bg-teal-50/10" 
          dotColor="#0d9488" 
        />
      </div>
    </div>
  );
}
