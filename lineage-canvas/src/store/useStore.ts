import { create } from 'zustand';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from '../db/repository';
import { db } from '../db/database';
import type { TableNode, ColumnDef, TableEdge, ColumnEdge, EditEvent, TableMetadata, ColumnMetadata, ColumnStat, Project, Canvas, System, SavedComparison, ComparisonEndpoint } from '../types/models';

export type AppView = 'canvas' | 'compare';

interface AppState {
  // Project / canvas hierarchy
  projects: Record<string, Project>;
  canvases: Record<string, Canvas>;
  comparisons: Record<string, SavedComparison>;
  activeProjectId: string | null;
  activeCanvasId: string | null;
  activeComparisonId: string | null;
  activeSystemTab: System;
  view: AppView;

  // Active-canvas graph data
  nodes: Record<string, TableNode>;
  tableEdges: Record<string, TableEdge>;
  columnEdges: Record<string, ColumnEdge>;
  selectedNodeId: string | null;
  selectedColumn: { datasetId: string; columnName: string } | null;

  // Project / canvas actions
  loadProjects: () => Promise<void>;
  loadCanvas: (canvasId: string) => Promise<void>;
  createProject: (name: string, legacySystemName: string, targetSystemName: string) => Promise<string>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  updateProjectSystems: (projectId: string, legacySystemName: string, targetSystemName: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  selectProject: (projectId: string | null) => void;
  createCanvas: (projectId: string, name: string) => Promise<string>;
  renameCanvas: (canvasId: string, name: string) => Promise<void>;
  deleteCanvas: (canvasId: string) => Promise<void>;
  selectCanvas: (canvasId: string) => Promise<void>;
  cloneCanvas: (sourceCanvasId: string, name: string) => Promise<string>;
  cloneProject: (sourceProjectId: string, name: string) => Promise<string>;
  setActiveSystemTab: (system: System) => void;
  setView: (view: AppView) => void;

  // Saved comparison views
  loadComparisons: () => Promise<void>;
  saveComparison: (comparison: SavedComparison) => Promise<void>;
  deleteComparison: (id: string) => Promise<void>;
  openComparison: (projectId: string, comparisonId: string | null) => void;

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
      projects: {},
      canvases: {},
      comparisons: {},
      activeProjectId: null,
      activeCanvasId: null,
      activeComparisonId: null,
      activeSystemTab: 'LEGACY',
      view: 'canvas',

      nodes: {},
      tableEdges: {},
      columnEdges: {},
      selectedNodeId: null,
      selectedColumn: null,

      loadProjects: async () => {
        const projectsArray = await Repository.getAllProjects();
        const canvasesArray = await Repository.getAllCanvases();
        const comparisonsArray = await Repository.getAllComparisons();
        const projects: Record<string, Project> = {};
        for (const p of projectsArray) projects[p.id] = p;
        const canvases: Record<string, Canvas> = {};
        for (const c of canvasesArray) canvases[c.id] = c;
        const comparisons: Record<string, SavedComparison> = {};
        for (const c of comparisonsArray) comparisons[c.id] = c;
        set({ projects, canvases, comparisons });
      },

      loadComparisons: async () => {
        const comparisonsArray = await Repository.getAllComparisons();
        const comparisons: Record<string, SavedComparison> = {};
        for (const c of comparisonsArray) comparisons[c.id] = c;
        set({ comparisons });
      },

      loadCanvas: async (canvasId) => {
        const nodesArray = await Repository.getTableNodesByCanvas(canvasId);
        const tEdges = await Repository.getTableEdgesByCanvas(canvasId);
        const cEdges = await Repository.getColumnEdgesByCanvas(canvasId);

        const nodes: Record<string, TableNode> = {};
        for (const n of nodesArray) nodes[n.datasetId] = n;

        const tableEdges: Record<string, TableEdge> = {};
        for (const e of tEdges) tableEdges[e.edgeId] = e;

        const columnEdges: Record<string, ColumnEdge> = {};
        for (const e of cEdges) columnEdges[e.edgeId] = e;

        const canvas = get().canvases[canvasId];
        set({
          nodes,
          tableEdges,
          columnEdges,
          activeCanvasId: canvasId,
          activeProjectId: canvas ? canvas.projectId : get().activeProjectId,
          selectedNodeId: null,
          selectedColumn: null,
        });
      },

      createProject: async (name, legacySystemName, targetSystemName) => {
        const now = new Date().toISOString();
        const project: Project = {
          id: uuidv4(),
          name,
          legacySystemName: legacySystemName || 'Legacy',
          targetSystemName: targetSystemName || 'Target',
          createdAt: now,
          updatedAt: now,
        };
        await Repository.saveProject(project);
        // Auto-create a first canvas so the user lands somewhere usable.
        const canvas: Canvas = {
          id: uuidv4(),
          projectId: project.id,
          name: 'Canvas 1',
          createdAt: now,
          updatedAt: now,
        };
        await Repository.saveCanvas(canvas);
        set((state) => ({
          projects: { ...state.projects, [project.id]: project },
          canvases: { ...state.canvases, [canvas.id]: canvas },
          activeProjectId: project.id,
        }));
        await get().selectCanvas(canvas.id);
        return project.id;
      },

      renameProject: async (projectId, name) => {
        const project = get().projects[projectId];
        if (!project) return;
        const updated = { ...project, name, updatedAt: new Date().toISOString() };
        await Repository.saveProject(updated);
        set((state) => ({ projects: { ...state.projects, [projectId]: updated } }));
      },

      updateProjectSystems: async (projectId, legacySystemName, targetSystemName) => {
        const project = get().projects[projectId];
        if (!project) return;
        const updated = { ...project, legacySystemName, targetSystemName, updatedAt: new Date().toISOString() };
        await Repository.saveProject(updated);
        set((state) => ({ projects: { ...state.projects, [projectId]: updated } }));
      },

      deleteProject: async (projectId) => {
        await Repository.deleteProject(projectId);
        set((state) => {
          const projects = { ...state.projects };
          delete projects[projectId];
          const canvases = { ...state.canvases };
          for (const id of Object.keys(canvases)) {
            if (canvases[id].projectId === projectId) delete canvases[id];
          }
          const comparisons = { ...state.comparisons };
          for (const id of Object.keys(comparisons)) {
            if (comparisons[id].projectId === projectId) delete comparisons[id];
          }
          const wasActive = state.activeProjectId === projectId;
          return {
            projects,
            canvases,
            comparisons,
            activeProjectId: wasActive ? null : state.activeProjectId,
            activeCanvasId: wasActive ? null : state.activeCanvasId,
            nodes: wasActive ? {} : state.nodes,
            tableEdges: wasActive ? {} : state.tableEdges,
            columnEdges: wasActive ? {} : state.columnEdges,
          };
        });
      },

      selectProject: (projectId) => set({ activeProjectId: projectId }),

      createCanvas: async (projectId, name) => {
        const now = new Date().toISOString();
        const canvas: Canvas = {
          id: uuidv4(),
          projectId,
          name: name || 'Canvas',
          createdAt: now,
          updatedAt: now,
        };
        await Repository.saveCanvas(canvas);
        set((state) => ({ canvases: { ...state.canvases, [canvas.id]: canvas } }));
        return canvas.id;
      },

      renameCanvas: async (canvasId, name) => {
        const canvas = get().canvases[canvasId];
        if (!canvas) return;
        const updated = { ...canvas, name, updatedAt: new Date().toISOString() };
        await Repository.saveCanvas(updated);
        set((state) => ({ canvases: { ...state.canvases, [canvasId]: updated } }));
      },

      deleteCanvas: async (canvasId) => {
        await Repository.deleteCanvas(canvasId);
        const wasActive = get().activeCanvasId === canvasId;
        set((state) => {
          const canvases = { ...state.canvases };
          delete canvases[canvasId];
          return {
            canvases,
            activeCanvasId: wasActive ? null : state.activeCanvasId,
            nodes: wasActive ? {} : state.nodes,
            tableEdges: wasActive ? {} : state.tableEdges,
            columnEdges: wasActive ? {} : state.columnEdges,
          };
        });
      },

      selectCanvas: async (canvasId) => {
        set({ view: 'canvas', activeComparisonId: null });
        await get().loadCanvas(canvasId);
      },

      cloneCanvas: async (sourceCanvasId, name) => {
        const source = get().canvases[sourceCanvasId];
        if (!source) return sourceCanvasId;
        const now = new Date().toISOString();
        const newCanvas: Canvas = {
          id: uuidv4(),
          projectId: source.projectId,
          name: name || `${source.name} (copy)`,
          createdAt: now,
          updatedAt: now,
        };
        await Repository.saveCanvas(newCanvas);
        await Repository.copyCanvasContents(sourceCanvasId, newCanvas.id);
        set((state) => ({ canvases: { ...state.canvases, [newCanvas.id]: newCanvas } }));
        await get().selectCanvas(newCanvas.id);
        return newCanvas.id;
      },

      cloneProject: async (sourceProjectId, name) => {
        const source = get().projects[sourceProjectId];
        if (!source) return sourceProjectId;
        const now = new Date().toISOString();
        const newProject: Project = {
          ...source,
          id: uuidv4(),
          name: name || `${source.name} (copy)`,
          createdAt: now,
          updatedAt: now,
        };
        await Repository.saveProject(newProject);

        // Clone every canvas (deep-copying its tables/edges) and record old→new ids.
        const sourceCanvases = Object.values(get().canvases)
          .filter(c => c.projectId === sourceProjectId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const canvasIdMap: Record<string, string> = {};
        const newCanvases: Canvas[] = [];
        for (const c of sourceCanvases) {
          const newId = uuidv4();
          canvasIdMap[c.id] = newId;
          const newCanvas: Canvas = { ...c, id: newId, projectId: newProject.id, createdAt: now, updatedAt: now };
          await Repository.saveCanvas(newCanvas);
          await Repository.copyCanvasContents(c.id, newId);
          newCanvases.push(newCanvas);
        }

        // Clone saved comparisons, remapping every datasetId to its copied canvas.
        const remap = (datasetId: string) => {
          const idx = datasetId.indexOf('::');
          if (idx < 0) return datasetId;
          const oldC = datasetId.slice(0, idx);
          const newC = canvasIdMap[oldC];
          return newC ? `${newC}::${datasetId.slice(idx + 2)}` : datasetId;
        };
        const remapEndpoint = (e?: ComparisonEndpoint) => e ? { ...e, datasetId: remap(e.datasetId) } : e;

        const sourceComparisons = Object.values(get().comparisons).filter(c => c.projectId === sourceProjectId);
        const newComparisons: SavedComparison[] = [];
        for (const cmp of sourceComparisons) {
          // "Across projects" comparisons reference absolute tables across projects,
          // so they are copied verbatim — the copy must keep pointing at the originals
          // (it must not change when this project is duplicated). Within-project and
          // column comparisons are remapped onto the new project's copied tables.
          const newCmp: SavedComparison = cmp.mode === 'projects'
            ? { ...cmp, id: uuidv4(), projectId: newProject.id, createdAt: now, updatedAt: now }
            : {
                ...cmp,
                id: uuidv4(),
                projectId: newProject.id,
                left: remapEndpoint(cmp.left),
                right: remapEndpoint(cmp.right),
                columnPairs: cmp.columnPairs?.map(p => ({ left: remapEndpoint(p.left)!, right: remapEndpoint(p.right)! })),
                createdAt: now,
                updatedAt: now,
              };
          await Repository.saveComparison(newCmp);
          newComparisons.push(newCmp);
        }

        set((state) => {
          const canvases = { ...state.canvases };
          for (const c of newCanvases) canvases[c.id] = c;
          const comparisons = { ...state.comparisons };
          for (const c of newComparisons) comparisons[c.id] = c;
          return {
            projects: { ...state.projects, [newProject.id]: newProject },
            canvases,
            comparisons,
            activeProjectId: newProject.id,
          };
        });
        if (newCanvases.length) await get().selectCanvas(newCanvases[0].id);
        return newProject.id;
      },

      setActiveSystemTab: (system) => set({ activeSystemTab: system }),

      setView: (view) => set({ view }),

      saveComparison: async (comparison) => {
        await Repository.saveComparison(comparison);
        set((state) => ({
          comparisons: { ...state.comparisons, [comparison.id]: comparison },
          activeComparisonId: comparison.id,
        }));
      },

      deleteComparison: async (id) => {
        await Repository.deleteComparison(id);
        set((state) => {
          const comparisons = { ...state.comparisons };
          delete comparisons[id];
          return {
            comparisons,
            activeComparisonId: state.activeComparisonId === id ? null : state.activeComparisonId,
          };
        });
      },

      openComparison: (projectId, comparisonId) =>
        set({ view: 'compare', activeProjectId: projectId, activeComparisonId: comparisonId }),

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
