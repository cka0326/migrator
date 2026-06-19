import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import type { TableNode } from '../types/models';

const elk = new ELK();

export async function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
    },
    children: nodes.map(n => ({
      id: n.id,
      width: 280,
      height: 80 + ((n.data as unknown as TableNode).columns?.length || 0) * 32,
      // Pass a partition hint to try to keep them separate
      layoutOptions: {
        'elk.partitioning.partition': (n.data as unknown as TableNode).system === 'LEGACY' ? 0 : 1,
      }
    })),
    edges: edges.map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target]
    }))
  };

  const layoutedGraph = await elk.layout(graph);
  
  const layoutedNodes = nodes.map(node => {
    const layoutNode = layoutedGraph.children?.find((n: any) => n.id === node.id);
    // If the user manually dragged it and we saved position, we could use that instead
    // But for auto-layout we override.
    return {
      ...node,
      position: {
        x: layoutNode?.x || 0,
        y: layoutNode?.y || 0
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}
