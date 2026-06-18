import { create } from 'zustand';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from '../db/repository';
import { db } from '../db/database';
import type { TableNode, ColumnDef, TableEdge, ColumnEdge, EditEvent, TableMetadata, ColumnMetadata, ColumnStat } from '../types/models';

interface AppState {
  nodes: Record<string, TableNode>;
  tableEdges: Record<string, TableEdge>;
  columnEdges: Record<string, ColumnEdge>;
  selectedNodeId: string | null;
  selectedColumn: { datasetId: string; columnName: string } | null;

  loadNodes: () => Promise<void>;
  selectNode: (id: string | null) => void;
  selectColumn: (datasetId: string | null, columnName: string | null) => void;
  
  addTableNode: (node: TableNode) => Promise<void>;
  deleteTableNode: (datasetId: string) => Promise<void>;
  updateTableMetadata: (datasetId: string, metadata: Partial<TableMetadata>) => Promise<void>;
  
  addColumn: (datasetId: string, column: ColumnDef) => Promise<void>;
  removeColumn: (datasetId: string, columnName: string) => Promise<void>;
  updateColumnMetadata: (datasetId: string, columnName: string, metadata: Partial<ColumnMetadata>) => Promise<void>;
  updateColumnStats: (datasetId: string, columnName: string, stats: Partial<ColumnStat>) => Promise<void>;
  updateColumn: (datasetId: string, columnName: string, updates: Partial<ColumnDef>) => Promise<void>;
  reorderColumns: (datasetId: string, newOrder: string[]) => Promise<void>;
  updateTableNodePosition: (datasetId: string, position: { x: number; y: number }) => Promise<void>;
  updateTableNodePositions: (positions: Record<string, { x: number; y: number }>) => Promise<void>;
  toggleNodeCollapse: (datasetId: string) => Promise<void>;
  
  addTableEdge: (edge: TableEdge) => Promise<void>;
  addColumnEdge: (edge: ColumnEdge) => Promise<void>;
  deleteTableEdge: (edgeId: string) => Promise<void>;
  deleteColumnEdge: (edgeId: string) => Promise<void>;
}

const logEdit = async (action: EditEvent['action'], entityRef: string, before?: any, after?: any) => {
  const event: EditEvent = {
    id: uuidv4(),
    at: new Date().toISOString(),
    actor: 'USER',
    entity: 'NODE',
    entityRef,
    action,
    before,
    after
  };
  await Repository.logEditEvent(event);
};

export const useStore = create<AppState>()(
  temporal(
    (set, get) => ({
      nodes: {},
      tableEdges: {},
      columnEdges: {},
      selectedNodeId: null,
      selectedColumn: null,

      loadNodes: async () => {
        const nodesArray = await Repository.getAllTableNodes();
        const tEdges = await Repository.getAllTableEdges();
        const cEdges = await Repository.getAllColumnEdges();

        const nodes: Record<string, TableNode> = {};
        for (const n of nodesArray) {
          nodes[n.datasetId] = n;
        }
        
        const tableEdges: Record<string, TableEdge> = {};
        for (const e of tEdges) {
          tableEdges[e.edgeId] = e;
        }

        const columnEdges: Record<string, ColumnEdge> = {};
        for (const e of cEdges) {
          columnEdges[e.edgeId] = e;
        }

        set({ nodes, tableEdges, columnEdges });
      },

      selectNode: (id) => set({ selectedNodeId: id }),

      selectColumn: (datasetId, columnName) => {
        if (datasetId && columnName) {
          set({ selectedColumn: { datasetId, columnName } });
        } else {
          set({ selectedColumn: null });
        }
      },

      addTableNode: async (node) => {
        set((state) => ({ nodes: { ...state.nodes, [node.datasetId]: node } }));
        await Repository.saveTableNode(node);
        await logEdit('ADD_NODE', node.datasetId, null, node);
      },

      deleteTableNode: async (datasetId) => {
        const node = get().nodes[datasetId];
        if (!node) return;
        set((state) => {
          const newNodes = { ...state.nodes };
          delete newNodes[datasetId];
          return { 
            nodes: newNodes, 
            selectedNodeId: state.selectedNodeId === datasetId ? null : state.selectedNodeId 
          };
        });
        await Repository.deleteTableNode(datasetId);
        await logEdit('DELETE_NODE', datasetId, node, null);
      },

      updateTableMetadata: async (datasetId, metadataUpdates) => {
        const node = get().nodes[datasetId];
        if (!node) return;
        
        const updatedNode = {
          ...node,
          metadata: { ...node.metadata, ...metadataUpdates },
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('EDIT_TABLE_META', datasetId, node.metadata, updatedNode.metadata);
      },

      addColumn: async (datasetId, column) => {
        const node = get().nodes[datasetId];
        if (!node) return;
        
        if (node.columns.some(c => c.name === column.name)) return;

        const updatedNode = {
          ...node,
          columns: [...node.columns, column],
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('ADD_COLUMN', `${datasetId}.${column.name}`, null, column);
      },

      removeColumn: async (datasetId, columnName) => {
        const node = get().nodes[datasetId];
        if (!node) return;

        const updatedNode = {
          ...node,
          columns: node.columns.filter(c => c.name !== columnName),
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('REMOVE_COLUMN', `${datasetId}.${columnName}`);
      },

      updateColumnMetadata: async (datasetId, columnName, metaUpdates) => {
        const node = get().nodes[datasetId];
        if (!node) return;

        const updatedNode = {
          ...node,
          columns: node.columns.map(c => 
            c.name === columnName 
              ? { ...c, metadata: { ...c.metadata, ...metaUpdates }, lastEditedBy: "USER" as const }
              : c
          ),
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('EDIT_COLUMN_META', `${datasetId}.${columnName}`);
      },

      updateColumnStats: async (datasetId, columnName, statsUpdates) => {
        const node = get().nodes[datasetId];
        if (!node) return;

        const updatedNode = {
          ...node,
          columns: node.columns.map(c => 
            c.name === columnName 
              ? { ...c, stats: { ...c.stats, ...statsUpdates }, lastEditedBy: "USER" as const }
              : c
          ),
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('EDIT_COLUMN_STATS', `${datasetId}.${columnName}`);
      },

      updateColumn: async (datasetId, columnName, updates) => {
        const node = get().nodes[datasetId];
        if (!node) return;

        const updatedNode = {
          ...node,
          columns: node.columns.map(c => 
            c.name === columnName 
              ? { 
                  ...c, 
                  ...updates, 
                  metadata: { ...c.metadata, ...updates.metadata },
                  stats: { ...c.stats, ...updates.stats },
                  lastEditedBy: "USER" as const 
                }
              : c
          ),
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('EDIT_COLUMN_META', `${datasetId}.${columnName}`);
      },

      reorderColumns: async (datasetId, newOrder) => {
        const node = get().nodes[datasetId];
        if (!node) return;

        const orderMap = new Map(newOrder.map((name, idx) => [name, idx + 1]));
        
        const updatedNode = {
          ...node,
          columns: [...node.columns].map(c => ({
            ...c,
            ordinal: orderMap.get(c.name) ?? c.ordinal
          })).sort((a, b) => a.ordinal - b.ordinal),
          lastEditedBy: "USER" as const,
          updatedAt: new Date().toISOString()
        };
        
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
        await logEdit('REORDER', datasetId);
      },

      updateTableNodePosition: async (datasetId, position) => {
        const node = get().nodes[datasetId];
        if (!node) return;
        const updatedNode = { ...node, position };
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
      },

      updateTableNodePositions: async (positions) => {
        const updatedNodes = { ...get().nodes };
        const promises = [];
        for (const [datasetId, pos] of Object.entries(positions)) {
          const node = updatedNodes[datasetId];
          if (node) {
            const updatedNode = { ...node, position: pos };
            updatedNodes[datasetId] = updatedNode;
            promises.push(Repository.saveTableNode(updatedNode));
          }
        }
        set({ nodes: updatedNodes });
        await Promise.all(promises);
      },

      toggleNodeCollapse: async (datasetId) => {
        const node = get().nodes[datasetId];
        if (!node) return;
        const updatedNode = { ...node, collapsed: !node.collapsed };
        set((state) => ({ nodes: { ...state.nodes, [datasetId]: updatedNode } }));
        await Repository.saveTableNode(updatedNode);
      },

      addTableEdge: async (edge) => {
        set((state) => ({ tableEdges: { ...state.tableEdges, [edge.edgeId]: edge } }));
        await db.tableEdges.put(edge);
        await logEdit('ADD_EDGE', edge.edgeId, null, edge);
      },

      addColumnEdge: async (edge) => {
        set((state) => ({ columnEdges: { ...state.columnEdges, [edge.edgeId]: edge } }));
        await db.columnEdges.put(edge);
        await logEdit('ADD_EDGE', edge.edgeId, null, edge);
      },

      deleteTableEdge: async (edgeId) => {
        set((state) => {
          const newEdges = { ...state.tableEdges };
          delete newEdges[edgeId];
          return { tableEdges: newEdges };
        });
        await db.tableEdges.delete(edgeId);
        await logEdit('DELETE_EDGE', edgeId);
      },

      deleteColumnEdge: async (edgeId) => {
        set((state) => {
          const newEdges = { ...state.columnEdges };
          delete newEdges[edgeId];
          return { columnEdges: newEdges };
        });
        await db.columnEdges.delete(edgeId);
        await logEdit('DELETE_EDGE', edgeId);
      }
    }),
    {
      partialize: (state) => ({ nodes: state.nodes }),
    }
  )
);
