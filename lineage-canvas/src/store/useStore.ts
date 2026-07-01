import { create } from 'zustand';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from '../db/repository';
import { db } from '../db/database';
import type { TableNode, ColumnDef, TableEdge, ColumnEdge, EditEvent, TableMetadata, ColumnMetadata, ColumnStat, Project, Canvas, System, SavedComparison, ComparisonEndpoint, ComparisonMode, ColumnPair, TableMapping, ColumnMappingPair, ValidationState } from '../types/models';
import { ingestParsedModel } from '../db/ingestion';
import type { ParsedImportModel, ImportTarget, ImportOptions, ImportSummary } from '../lib/importModel';
import { columnEdgeId, tableEdgeId } from '../lib/edgeIds';

export type AppView = 'canvas' | 'compare' | 'mapping';

// A read-only comparison opened from the Mapping view (e.g. "compare this mapped
// pair"). It reuses the Compare view's rendering but is never persisted, and the
// user cannot save it. `alignPairs` (for table mode) tells the diff to align the
// two tables' columns by the mapping's column pairs instead of by name, so mapped
// columns are compared even when they were renamed. `returnTo` is where the
// Compare view's back button goes.
export interface EphemeralComparison {
  mode: ComparisonMode;
  projectId: string;
  title: string;
  left?: ComparisonEndpoint;
  right?: ComparisonEndpoint;
  columnPairs?: ColumnPair[];
  alignPairs?: { legacy: string; target: string }[];
  returnTo: AppView;
}

// Remembers which project/canvas/comparison was open so a page reload restores it.
// Only the active selection lives here; the graph data itself is in IndexedDB.
const SESSION_KEY = 'lineage-canvas.session';
interface PersistedSession {
  view: AppView;
  activeProjectId: string | null;
  activeCanvasId: string | null;
  activeComparisonId: string | null;
  activeSystemTab: System;
}

interface AppState {
  // Project / canvas hierarchy
  projects: Record<string, Project>;
  canvases: Record<string, Canvas>;
  comparisons: Record<string, SavedComparison>;
  activeProjectId: string | null;
  activeCanvasId: string | null;
  activeComparisonId: string | null;
  // Read-only comparison opened from the Mapping view (not saved). Null otherwise.
  ephemeralComparison: EphemeralComparison | null;
  activeSystemTab: System;
  view: AppView;

  // Active-canvas graph data
  nodes: Record<string, TableNode>;
  tableEdges: Record<string, TableEdge>;
  columnEdges: Record<string, ColumnEdge>;
  mappings: Record<string, TableMapping>;   // canvas-level legacy↔target table mappings
  selectedNodeId: string | null;
  selectedColumn: { datasetId: string; columnName: string } | null;

  // Column-lineage focus mode: when a column is "focused", the graph traces its
  // full upstream + downstream column lineage and each participating node shows
  // only its traced columns. `tracedColumns` maps datasetId -> visible columns.
  columnFocus: { datasetId: string; column: string } | null;
  tracedColumns: Record<string, string[]>;

  // Project / canvas actions
  loadProjects: () => Promise<void>;
  // Load projects, then restore the last-open canvas/comparison from localStorage
  // so a page reload returns to where the user was.
  initSession: () => Promise<void>;
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

  // Import a reviewed/edited parsed model (JSON or Excel) into a target canvas/system.
  runImport: (model: ParsedImportModel, target: ImportTarget, options: ImportOptions) => Promise<ImportSummary>;

  // Saved comparison views
  loadComparisons: () => Promise<void>;
  saveComparison: (comparison: SavedComparison) => Promise<void>;
  deleteComparison: (id: string) => Promise<void>;
  openComparison: (projectId: string, comparisonId: string | null) => void;
  // Open a read-only, unsavable comparison (from the Mapping view).
  openEphemeralComparison: (cmp: EphemeralComparison) => void;

  // Canvas table mappings (legacy ↔ target)
  createTableMapping: (legacyDatasetId: string, targetDatasetId: string) => Promise<string | null>;
  updateTableMapping: (id: string, updates: Partial<Pick<TableMapping, 'columnMappings' | 'validationState' | 'notes'>>) => Promise<void>;
  deleteTableMapping: (id: string) => Promise<void>;
  // Auto-create mappings for unmapped legacy↔target tables that share a name (with
  // name-matched column pairs). Returns the number of table mappings created.
  autoSuggestMappings: (canvasId: string) => Promise<number>;
  // Fill a mapping's column pairs by name match (non-destructive: keeps existing pairs).
  autoSuggestColumns: (mappingId: string) => Promise<void>;

  // Shareable bundles (.zip): download a project/comparison, or load one (additive).
  exportProject: (projectId: string) => Promise<void>;
  importProject: (file: File) => Promise<void>;
  exportComparison: (comparisonId: string) => Promise<void>;
  importComparison: (file: File) => Promise<void>;

  selectNode: (id: string | null) => void;
  selectColumn: (datasetId: string | null, columnName: string | null) => void;
  focusColumn: (datasetId: string, column: string) => void;
  clearColumnFocus: () => void;

  addTableNode: (node: TableNode) => Promise<void>;
  deleteTableNode: (datasetId: string) => Promise<void>;
  updateTableMetadata: (datasetId: string, metadata: Partial<TableMetadata>) => Promise<void>;
  // Rename a table's identity (namespace/name). This changes its datasetId, so all
  // edges are re-pointed. Returns an error message if invalid/colliding, else null.
  renameTable: (datasetId: string, namespace: string, name: string) => Promise<string | null>;

  addColumn: (datasetId: string, column: ColumnDef) => Promise<void>;
  removeColumn: (datasetId: string, columnName: string) => Promise<void>;
  // Rename a column and re-point every column edge that references it. Returns an
  // error message if invalid/duplicate within the table, else null.
  renameColumn: (datasetId: string, oldName: string, newName: string) => Promise<string | null>;
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

  // Reconcile duplicate columns/tables (from imperfect imports). Connections are
  // re-wired onto the merged entity and de-duplicated automatically.
  mergeColumns: (datasetId: string, sourceNames: string[], merged: ColumnDef) => Promise<void>;
  mergeTables: (canvasId: string, system: System, sourceDatasetIds: string[], merged: MergedTableInput) => Promise<void>;
}

export interface MergedTableInput {
  name: string;
  namespace: string;
  metadata: TableMetadata;
  columns: ColumnDef[];
}

// Trace the full column lineage reachable from a focus column. Walks column
// edges downstream (focus column as a source -> its targets) and upstream (focus
// column as a target -> its sources), transitively, across the whole graph.
// Returns a datasetId -> [columns] map of everything that should stay visible.
const computeColumnTrace = (
  focus: { datasetId: string; column: string },
  columnEdges: Record<string, ColumnEdge>,
): Record<string, string[]> => {
  const key = (d: string, c: string) => `${d} ${c}`;
  const focusKey = key(focus.datasetId, focus.column);
  const edges = Object.values(columnEdges);

  // Downstream closure: follow edges in flow direction (source -> target).
  const downstream = new Set<string>([focusKey]);
  const downQueue: { datasetId: string; column: string }[] = [focus];
  while (downQueue.length) {
    const cur = downQueue.shift()!;
    for (const e of edges) {
      if (e.sources.some(s => s.datasetId === cur.datasetId && s.column === cur.column)) {
        const k = key(e.target.datasetId, e.target.column);
        if (!downstream.has(k)) {
          downstream.add(k);
          downQueue.push({ datasetId: e.target.datasetId, column: e.target.column });
        }
      }
    }
  }

  // Upstream closure: follow edges in reverse (target -> sources).
  const upstream = new Set<string>([focusKey]);
  const upQueue: { datasetId: string; column: string }[] = [focus];
  while (upQueue.length) {
    const cur = upQueue.shift()!;
    for (const e of edges) {
      if (e.target.datasetId === cur.datasetId && e.target.column === cur.column) {
        for (const s of e.sources) {
          const k = key(s.datasetId, s.column);
          if (!upstream.has(k)) {
            upstream.add(k);
            upQueue.push({ datasetId: s.datasetId, column: s.column });
          }
        }
      }
    }
  }

  const map: Record<string, string[]> = {};
  for (const k of new Set([...downstream, ...upstream])) {
    const sep = k.indexOf(' ');
    const d = k.slice(0, sep);
    const c = k.slice(sep + 1);
    (map[d] ||= []).push(c);
  }
  return map;
};

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
      ephemeralComparison: null,
      activeSystemTab: 'LEGACY',
      view: 'canvas',

      nodes: {},
      tableEdges: {},
      columnEdges: {},
      mappings: {},
      selectedNodeId: null,
      selectedColumn: null,
      columnFocus: null,
      tracedColumns: {},

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

      initSession: async () => {
        await get().loadProjects();

        let saved: PersistedSession | null = null;
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) saved = JSON.parse(raw) as PersistedSession;
        } catch { /* ignore corrupt/unavailable storage */ }
        if (!saved) return;

        const { canvases, comparisons } = get();

        // Restore a saved comparison view if it still exists.
        if (saved.view === 'compare' && saved.activeComparisonId && comparisons[saved.activeComparisonId]) {
          const cmp = comparisons[saved.activeComparisonId];
          get().openComparison(cmp.projectId, saved.activeComparisonId);
          return;
        }

        // Otherwise restore the last-open canvas (and its system tab) if it survives.
        if (saved.activeCanvasId && canvases[saved.activeCanvasId]) {
          await get().loadCanvas(saved.activeCanvasId);
          if (saved.activeSystemTab) set({ activeSystemTab: saved.activeSystemTab });
        }
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
        const mappingsArray = await Repository.getTableMappingsByCanvas(canvasId);

        const nodes: Record<string, TableNode> = {};
        for (const n of nodesArray) nodes[n.datasetId] = n;

        const tableEdges: Record<string, TableEdge> = {};
        for (const e of tEdges) tableEdges[e.edgeId] = e;

        const columnEdges: Record<string, ColumnEdge> = {};
        for (const e of cEdges) columnEdges[e.edgeId] = e;

        const mappings: Record<string, TableMapping> = {};
        for (const m of mappingsArray) mappings[m.id] = m;

        const canvas = get().canvases[canvasId];
        set({
          nodes,
          tableEdges,
          columnEdges,
          mappings,
          activeCanvasId: canvasId,
          activeProjectId: canvas ? canvas.projectId : get().activeProjectId,
          selectedNodeId: null,
          selectedColumn: null,
          columnFocus: null,
          tracedColumns: {},
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
            mappings: wasActive ? {} : state.mappings,
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
            mappings: wasActive ? {} : state.mappings,
          };
        });
      },

      selectCanvas: async (canvasId) => {
        set({ view: 'canvas', activeComparisonId: null, ephemeralComparison: null });
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

        // Table mappings are already cloned per-canvas by Repository.copyCanvasContents
        // (called above), so they must not be copied again here or they would double up.

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

      setView: (view) => set({ view, ephemeralComparison: null }),

      // Bundle libs pull in xlsx/jszip — load them lazily so they're only fetched
      // when the user actually shares/imports (mirrors the Header upload flow).
      exportProject: async (projectId) => {
        const { exportProjectBundle } = await import('../lib/projectBundle');
        await exportProjectBundle(projectId);
      },

      importProject: async (file) => {
        const { importProjectBundle } = await import('../lib/projectBundle');
        const newProjectId = await importProjectBundle(file);
        await get().loadProjects();
        set({ activeProjectId: newProjectId });
      },

      exportComparison: async (comparisonId) => {
        const { exportComparisonBundle } = await import('../lib/comparisonBundle');
        await exportComparisonBundle(comparisonId);
      },

      importComparison: async (file) => {
        const { importComparisonBundle } = await import('../lib/comparisonBundle');
        const cmp = await importComparisonBundle(file);
        // Referenced projects/canvases may be new — refresh both maps before opening.
        await get().loadProjects();
        get().openComparison(cmp.projectId, cmp.id);
      },

      runImport: async (model, target, options) => {
        const summary = await ingestParsedModel(model, target, options);
        // Refresh projects (names may be referenced) and open the target canvas/system.
        await get().loadProjects();
        await get().selectCanvas(target.canvasId);
        set({ activeSystemTab: target.defaultSystem });
        return summary;
      },

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
        set({ view: 'compare', activeProjectId: projectId, activeComparisonId: comparisonId, ephemeralComparison: null }),

      openEphemeralComparison: (cmp) =>
        set({ view: 'compare', activeProjectId: cmp.projectId, activeComparisonId: null, ephemeralComparison: cmp }),

      // ---------- Canvas table mappings ----------
      createTableMapping: async (legacyDatasetId, targetDatasetId) => {
        const state = get();
        const canvasId = state.activeCanvasId;
        if (!canvasId) return 'No active canvas';
        const legacy = state.nodes[legacyDatasetId];
        const target = state.nodes[targetDatasetId];
        if (!legacy || legacy.system !== 'LEGACY') return 'Pick a legacy table';
        if (!target || target.system !== 'TARGET') return 'Pick a target table';
        const existing = Object.values(state.mappings);
        if (existing.some(m => m.legacyDatasetId === legacyDatasetId)) return 'This legacy table is already mapped';
        if (existing.some(m => m.targetDatasetId === targetDatasetId)) return 'This target table is already mapped';

        const now = new Date().toISOString();
        const mapping: TableMapping = {
          id: uuidv4(),
          canvasId,
          legacyDatasetId,
          targetDatasetId,
          columnMappings: [],
          validationState: 'NOT_STARTED',
          createdAt: now,
          updatedAt: now,
        };
        await Repository.saveTableMapping(mapping);
        set((s) => ({ mappings: { ...s.mappings, [mapping.id]: mapping } }));
        await logEdit('EDIT_TABLE_META', `mapping:${mapping.id}`, null, { legacyDatasetId, targetDatasetId });
        return null;
      },

      updateTableMapping: async (id, updates) => {
        const mapping = get().mappings[id];
        if (!mapping) return;
        const updated: TableMapping = { ...mapping, ...updates, updatedAt: new Date().toISOString() };
        await Repository.saveTableMapping(updated);
        set((s) => ({ mappings: { ...s.mappings, [id]: updated } }));
      },

      deleteTableMapping: async (id) => {
        await Repository.deleteTableMapping(id);
        set((s) => {
          const mappings = { ...s.mappings };
          delete mappings[id];
          return { mappings };
        });
      },

      autoSuggestMappings: async (canvasId) => {
        const state = get();
        if (state.activeCanvasId !== canvasId) return 0;
        const nodes = Object.values(state.nodes);
        const legacy = nodes.filter(n => n.system === 'LEGACY');
        const target = nodes.filter(n => n.system === 'TARGET');
        const existing = Object.values(state.mappings);
        const mappedLegacy = new Set(existing.map(m => m.legacyDatasetId));
        const mappedTarget = new Set(existing.map(m => m.targetDatasetId));

        // Index target tables by name (case-insensitive); first unmapped wins.
        const targetByName = new Map<string, TableNode>();
        for (const t of target) {
          if (mappedTarget.has(t.datasetId)) continue;
          const key = t.name.toUpperCase();
          if (!targetByName.has(key)) targetByName.set(key, t);
        }

        const now = new Date().toISOString();
        const created: TableMapping[] = [];
        const usedTargets = new Set<string>();
        for (const l of legacy) {
          if (mappedLegacy.has(l.datasetId)) continue;
          const match = targetByName.get(l.name.toUpperCase());
          if (!match || usedTargets.has(match.datasetId)) continue;
          usedTargets.add(match.datasetId);

          // name-matched columns
          const targetCols = new Map(match.columns.map(c => [c.name.toUpperCase(), c.name]));
          const columnMappings: ColumnMappingPair[] = [];
          for (const lc of l.columns) {
            const tc = targetCols.get(lc.name.toUpperCase());
            if (tc) columnMappings.push({ legacyColumn: lc.name, targetColumn: tc });
          }

          created.push({
            id: uuidv4(), canvasId, legacyDatasetId: l.datasetId, targetDatasetId: match.datasetId,
            columnMappings, validationState: 'NOT_STARTED', createdAt: now, updatedAt: now,
          });
        }

        for (const m of created) await Repository.saveTableMapping(m);
        if (created.length) {
          set((s) => {
            const mappings = { ...s.mappings };
            for (const m of created) mappings[m.id] = m;
            return { mappings };
          });
        }
        return created.length;
      },

      autoSuggestColumns: async (mappingId) => {
        const state = get();
        const mapping = state.mappings[mappingId];
        if (!mapping) return;
        const legacy = state.nodes[mapping.legacyDatasetId];
        const target = state.nodes[mapping.targetDatasetId];
        if (!legacy || !target) return;

        const pairedLegacy = new Set(mapping.columnMappings.map(cp => cp.legacyColumn.toUpperCase()));
        const pairedTarget = new Set(mapping.columnMappings.map(cp => cp.targetColumn.toUpperCase()));
        const targetByName = new Map(target.columns.map(c => [c.name.toUpperCase(), c.name]));

        const additions: ColumnMappingPair[] = [];
        for (const lc of legacy.columns) {
          if (pairedLegacy.has(lc.name.toUpperCase())) continue;
          const tc = targetByName.get(lc.name.toUpperCase());
          if (!tc || pairedTarget.has(tc.toUpperCase())) continue;
          pairedTarget.add(tc.toUpperCase());
          additions.push({ legacyColumn: lc.name, targetColumn: tc });
        }
        if (!additions.length) return;
        await get().updateTableMapping(mappingId, { columnMappings: [...mapping.columnMappings, ...additions] });
      },

      selectNode: (id) => set({ selectedNodeId: id }),

      selectColumn: (datasetId, columnName) => {
        if (datasetId && columnName) {
          set({ selectedColumn: { datasetId, columnName } });
        } else {
          set({ selectedColumn: null });
        }
      },

      focusColumn: (datasetId, column) => {
        const current = get().columnFocus;
        // Clicking the already-focused column clears focus and returns to normal.
        if (current && current.datasetId === datasetId && current.column === column) {
          set({ columnFocus: null, tracedColumns: {} });
          return;
        }
        // Re-root the trace on the newly clicked column (point of interest).
        const tracedColumns = computeColumnTrace({ datasetId, column }, get().columnEdges);
        set({ columnFocus: { datasetId, column }, tracedColumns });
      },

      clearColumnFocus: () => set({ columnFocus: null, tracedColumns: {} }),

      addTableNode: async (node) => {
        set((state) => ({ nodes: { ...state.nodes, [node.datasetId]: node } }));
        await Repository.saveTableNode(node);
        await logEdit('ADD_NODE', node.datasetId, null, node);
      },

      deleteTableNode: async (datasetId) => {
        const node = get().nodes[datasetId];
        if (!node) return;
        // Mappings that reference this table no longer make sense — remove them.
        const orphanedMappings = Object.values(get().mappings).filter(
          m => m.legacyDatasetId === datasetId || m.targetDatasetId === datasetId);
        set((state) => {
          const newNodes = { ...state.nodes };
          delete newNodes[datasetId];
          const mappings = { ...state.mappings };
          for (const m of orphanedMappings) delete mappings[m.id];
          return {
            nodes: newNodes,
            mappings,
            selectedNodeId: state.selectedNodeId === datasetId ? null : state.selectedNodeId
          };
        });
        await Repository.deleteTableNode(datasetId);
        for (const m of orphanedMappings) await Repository.deleteTableMapping(m.id);
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

        // Drop any column pairings that referenced the removed column.
        const colMapAffected = Object.values(get().mappings).filter(m =>
          (m.legacyDatasetId === datasetId && m.columnMappings.some(cp => cp.legacyColumn === columnName)) ||
          (m.targetDatasetId === datasetId && m.columnMappings.some(cp => cp.targetColumn === columnName)));
        if (colMapAffected.length) {
          const updates = colMapAffected.map(m => ({
            ...m,
            columnMappings: m.columnMappings.filter(cp =>
              !(m.legacyDatasetId === datasetId && cp.legacyColumn === columnName) &&
              !(m.targetDatasetId === datasetId && cp.targetColumn === columnName)),
            updatedAt: new Date().toISOString(),
          }));
          for (const m of updates) await Repository.saveTableMapping(m);
          set((s) => {
            const mappings = { ...s.mappings };
            for (const m of updates) mappings[m.id] = m;
            return { mappings };
          });
        }

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
      },

      mergeColumns: async (datasetId, sourceNames, merged) => {
        const state = get();
        const node = state.nodes[datasetId];
        if (!node || sourceNames.length === 0) return;
        const sourceSet = new Set(sourceNames);

        // New column list: drop the sources, put `merged` where the first source was.
        let placed = false;
        const cols: ColumnDef[] = [];
        for (const c of node.columns) {
          if (sourceSet.has(c.name)) {
            if (!placed) { cols.push(merged); placed = true; }
          } else cols.push(c);
        }
        if (!placed) cols.push(merged);
        const newColumns = cols.map((c, i) => ({ ...c, ordinal: i + 1 }));
        const updatedNode = { ...node, columns: newColumns, lastEditedBy: 'USER' as const, updatedAt: new Date().toISOString() };

        // Re-wire every column edge that references a merged source within this table.
        const isAffected = (r: { datasetId: string; column: string }) => r.datasetId === datasetId && sourceSet.has(r.column);
        const toDelete: string[] = [];
        const rewritten = new Map<string, ColumnEdge>();
        for (const e of Object.values(state.columnEdges)) {
          if (!isAffected(e.target) && !e.sources.some(isAffected)) continue;
          toDelete.push(e.edgeId);
          const newTarget = isAffected(e.target) ? { datasetId, column: merged.name } : e.target;
          let newSources = e.sources.map(s => (isAffected(s) ? { datasetId, column: merged.name } : s));
          // Drop self-loops and duplicate source endpoints (collapses combined links).
          const seen = new Set<string>();
          newSources = newSources.filter(s => {
            if (s.datasetId === newTarget.datasetId && s.column === newTarget.column) return false;
            const k = `${s.datasetId}::${s.column}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (newSources.length === 0) continue; // edge dissolves
          const newId = columnEdgeId(newTarget, newSources);
          if (!rewritten.has(newId)) rewritten.set(newId, { ...e, edgeId: newId, target: newTarget, sources: newSources });
        }
        const rewrittenList = [...rewritten.values()];

        await Repository.saveTableNode(updatedNode);
        if (toDelete.length) await db.columnEdges.bulkDelete(toDelete);
        if (rewrittenList.length) await db.columnEdges.bulkPut(rewrittenList);

        set((s) => {
          const columnEdges = { ...s.columnEdges };
          for (const id of toDelete) delete columnEdges[id];
          for (const e of rewrittenList) columnEdges[e.edgeId] = e;
          const selectedColumn = s.selectedColumn && s.selectedColumn.datasetId === datasetId && sourceSet.has(s.selectedColumn.columnName)
            ? null : s.selectedColumn;
          return { nodes: { ...s.nodes, [datasetId]: updatedNode }, columnEdges, selectedColumn };
        });
        await logEdit('EDIT_COLUMN_META', `${datasetId}.${merged.name}`, null, { mergedFrom: sourceNames });
      },

      mergeTables: async (canvasId, system, sourceDatasetIds, merged) => {
        const state = get();
        const sources = sourceDatasetIds.map(id => state.nodes[id]).filter(Boolean) as TableNode[];
        if (sources.length < 2) return;
        const srcSet = new Set(sourceDatasetIds);
        const newDatasetId = `${canvasId}::${system}:${merged.namespace}.${merged.name}`;
        const now = new Date().toISOString();

        const mergedColumns = merged.columns.map((c, i) => ({ ...c, ordinal: i + 1 }));
        const mergedNode: TableNode = {
          datasetId: newDatasetId,
          canvasId,
          system,
          namespace: merged.namespace,
          name: merged.name,
          qualifiedName: `${merged.namespace}.${merged.name}`,
          origin: 'MANUAL',
          completeness: 'PARTIAL',
          metadata: { ...merged.metadata, columnCount: mergedColumns.length },
          columns: mergedColumns,
          referencedByUploadIds: Array.from(new Set(sources.flatMap(s => s.referencedByUploadIds))),
          // Keep a position so the node doesn't jump to 0,0.
          position: sources.find(s => s.position)?.position,
          createdAt: now,
          updatedAt: now,
        };

        const remap = (id: string) => (srcSet.has(id) ? newDatasetId : id);

        // Table edges → repoint endpoints, drop self-loops, de-dup by content id.
        const teDelete: string[] = [];
        const teRewrite = new Map<string, TableEdge>();
        for (const e of Object.values(state.tableEdges)) {
          if (!srcSet.has(e.fromDataset) && !srcSet.has(e.toDataset)) continue;
          teDelete.push(e.edgeId);
          const from = remap(e.fromDataset);
          const to = remap(e.toDataset);
          if (from === to) continue; // self-loop after merge
          const id = tableEdgeId(from, to);
          if (!teRewrite.has(id)) teRewrite.set(id, { ...e, edgeId: id, fromDataset: from, toDataset: to });
        }

        // Column edges → repoint datasetIds, drop self-loops, de-dup + collapse sources.
        const ceDelete: string[] = [];
        const ceRewrite = new Map<string, ColumnEdge>();
        for (const e of Object.values(state.columnEdges)) {
          const touches = srcSet.has(e.target.datasetId) || e.sources.some(s => srcSet.has(s.datasetId));
          if (!touches) continue;
          ceDelete.push(e.edgeId);
          const newTarget = { datasetId: remap(e.target.datasetId), column: e.target.column };
          let newSources = e.sources.map(s => ({ datasetId: remap(s.datasetId), column: s.column }));
          const seen = new Set<string>();
          newSources = newSources.filter(s => {
            if (s.datasetId === newTarget.datasetId && s.column === newTarget.column) return false;
            const k = `${s.datasetId}::${s.column}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (newSources.length === 0) continue;
          const id = columnEdgeId(newTarget, newSources);
          if (!ceRewrite.has(id)) ceRewrite.set(id, { ...e, edgeId: id, target: newTarget, sources: newSources });
        }

        const teList = [...teRewrite.values()];
        const ceList = [...ceRewrite.values()];

        await db.transaction('rw', [db.tableNodes, db.tableEdges, db.columnEdges], async () => {
          await db.tableNodes.put(mergedNode);
          // Remove source nodes WITHOUT the edge cascade (edges are handled explicitly).
          await db.tableNodes.bulkDelete(sourceDatasetIds.filter(id => id !== newDatasetId));
          if (teDelete.length) await db.tableEdges.bulkDelete(teDelete);
          if (ceDelete.length) await db.columnEdges.bulkDelete(ceDelete);
          if (teList.length) await db.tableEdges.bulkPut(teList);
          if (ceList.length) await db.columnEdges.bulkPut(ceList);
        });

        set((s) => {
          const nodes = { ...s.nodes };
          for (const id of sourceDatasetIds) if (id !== newDatasetId) delete nodes[id];
          nodes[newDatasetId] = mergedNode;
          const tableEdges = { ...s.tableEdges };
          for (const id of teDelete) delete tableEdges[id];
          for (const e of teList) tableEdges[e.edgeId] = e;
          const columnEdges = { ...s.columnEdges };
          for (const id of ceDelete) delete columnEdges[id];
          for (const e of ceList) columnEdges[e.edgeId] = e;
          const selectedNodeId = s.selectedNodeId && srcSet.has(s.selectedNodeId) ? null : s.selectedNodeId;
          return { nodes, tableEdges, columnEdges, selectedNodeId };
        });
        await logEdit('ADD_NODE', newDatasetId, null, { mergedFrom: sourceDatasetIds });
      },

      renameTable: async (datasetId, namespace, name) => {
        const state = get();
        const node = state.nodes[datasetId];
        if (!node) return 'Table not found';

        const ns = namespace.trim().toUpperCase();
        const nm = name.trim().toUpperCase();
        if (!ns) return 'Namespace is required';
        if (!nm) return 'Table name is required';

        const newDatasetId = `${node.canvasId}::${node.system}:${ns}.${nm}`;
        if (newDatasetId === datasetId) {
          // No identity change — nothing to migrate.
          return null;
        }
        if (state.nodes[newDatasetId]) {
          return 'A different table with this namespace and name already exists in this canvas';
        }

        const now = new Date().toISOString();
        const renamedNode: TableNode = {
          ...node,
          datasetId: newDatasetId,
          namespace: ns,
          name: nm,
          qualifiedName: `${ns}.${nm}`,
          lastEditedBy: 'USER',
          updatedAt: now,
        };

        const remap = (id: string) => (id === datasetId ? newDatasetId : id);

        // Table edges → repoint endpoints, drop self-loops, de-dup by content id.
        const teDelete: string[] = [];
        const teRewrite = new Map<string, TableEdge>();
        for (const e of Object.values(state.tableEdges)) {
          if (e.fromDataset !== datasetId && e.toDataset !== datasetId) continue;
          teDelete.push(e.edgeId);
          const from = remap(e.fromDataset);
          const to = remap(e.toDataset);
          if (from === to) continue;
          const id = tableEdgeId(from, to);
          if (!teRewrite.has(id)) teRewrite.set(id, { ...e, edgeId: id, fromDataset: from, toDataset: to });
        }

        // Column edges → repoint datasetIds, de-dup by content id.
        const ceDelete: string[] = [];
        const ceRewrite = new Map<string, ColumnEdge>();
        for (const e of Object.values(state.columnEdges)) {
          const touches = e.target.datasetId === datasetId || e.sources.some(s => s.datasetId === datasetId);
          if (!touches) continue;
          ceDelete.push(e.edgeId);
          const newTarget = { datasetId: remap(e.target.datasetId), column: e.target.column };
          const newSources = e.sources.map(s => ({ datasetId: remap(s.datasetId), column: s.column }));
          const id = columnEdgeId(newTarget, newSources);
          if (!ceRewrite.has(id)) ceRewrite.set(id, { ...e, edgeId: id, target: newTarget, sources: newSources });
        }

        const teList = [...teRewrite.values()];
        const ceList = [...ceRewrite.values()];

        await db.transaction('rw', [db.tableNodes, db.tableEdges, db.columnEdges], async () => {
          await db.tableNodes.put(renamedNode);
          await db.tableNodes.delete(datasetId);
          if (teDelete.length) await db.tableEdges.bulkDelete(teDelete);
          if (ceDelete.length) await db.columnEdges.bulkDelete(ceDelete);
          if (teList.length) await db.tableEdges.bulkPut(teList);
          if (ceList.length) await db.columnEdges.bulkPut(ceList);
        });

        set((s) => {
          const nodes = { ...s.nodes };
          delete nodes[datasetId];
          nodes[newDatasetId] = renamedNode;
          const tableEdges = { ...s.tableEdges };
          for (const id of teDelete) delete tableEdges[id];
          for (const e of teList) tableEdges[e.edgeId] = e;
          const columnEdges = { ...s.columnEdges };
          for (const id of ceDelete) delete columnEdges[id];
          for (const e of ceList) columnEdges[e.edgeId] = e;
          const selectedNodeId = s.selectedNodeId === datasetId ? newDatasetId : s.selectedNodeId;
          const selectedColumn = s.selectedColumn?.datasetId === datasetId
            ? { ...s.selectedColumn, datasetId: newDatasetId } : s.selectedColumn;
          return { nodes, tableEdges, columnEdges, selectedNodeId, selectedColumn };
        });

        // Keep table mappings in sync: a rename changes the datasetId identity.
        const affectedMappings = Object.values(state.mappings).filter(
          m => m.legacyDatasetId === datasetId || m.targetDatasetId === datasetId);
        if (affectedMappings.length) {
          const updates = affectedMappings.map(m => ({
            ...m,
            legacyDatasetId: m.legacyDatasetId === datasetId ? newDatasetId : m.legacyDatasetId,
            targetDatasetId: m.targetDatasetId === datasetId ? newDatasetId : m.targetDatasetId,
            updatedAt: now,
          }));
          for (const m of updates) await Repository.saveTableMapping(m);
          set((s) => {
            const mappings = { ...s.mappings };
            for (const m of updates) mappings[m.id] = m;
            return { mappings };
          });
        }

        await logEdit('EDIT_TABLE_META', newDatasetId, { datasetId }, { datasetId: newDatasetId });
        return null;
      },

      renameColumn: async (datasetId, oldName, newName) => {
        const state = get();
        const node = state.nodes[datasetId];
        if (!node) return 'Table not found';

        const nm = newName.trim().toUpperCase();
        if (!nm) return 'Column name is required';
        if (nm === oldName) return null;
        if (node.columns.some(c => c.name === nm)) {
          return `A column named "${nm}" already exists in this table`;
        }

        const updatedNode = {
          ...node,
          columns: node.columns.map(c => (c.name === oldName ? { ...c, name: nm, lastEditedBy: 'USER' as const } : c)),
          lastEditedBy: 'USER' as const,
          updatedAt: new Date().toISOString(),
        };

        // Re-point every column edge that references this column within this table.
        const isAffected = (r: { datasetId: string; column: string }) => r.datasetId === datasetId && r.column === oldName;
        const toDelete: string[] = [];
        const rewritten = new Map<string, ColumnEdge>();
        for (const e of Object.values(state.columnEdges)) {
          if (!isAffected(e.target) && !e.sources.some(isAffected)) continue;
          toDelete.push(e.edgeId);
          const newTarget = isAffected(e.target) ? { datasetId, column: nm } : e.target;
          const newSources = e.sources.map(s => (isAffected(s) ? { datasetId, column: nm } : s));
          const newId = columnEdgeId(newTarget, newSources);
          if (!rewritten.has(newId)) rewritten.set(newId, { ...e, edgeId: newId, target: newTarget, sources: newSources });
        }
        const rewrittenList = [...rewritten.values()];

        await Repository.saveTableNode(updatedNode);
        if (toDelete.length) await db.columnEdges.bulkDelete(toDelete);
        if (rewrittenList.length) await db.columnEdges.bulkPut(rewrittenList);

        set((s) => {
          const columnEdges = { ...s.columnEdges };
          for (const id of toDelete) delete columnEdges[id];
          for (const e of rewrittenList) columnEdges[e.edgeId] = e;
          const selectedColumn = s.selectedColumn?.datasetId === datasetId && s.selectedColumn.columnName === oldName
            ? { datasetId, columnName: nm } : s.selectedColumn;
          return { nodes: { ...s.nodes, [datasetId]: updatedNode }, columnEdges, selectedColumn };
        });

        // Keep column mappings in sync with the rename, on whichever side this table is.
        const colAffected = Object.values(state.mappings).filter(m =>
          (m.legacyDatasetId === datasetId && m.columnMappings.some(cp => cp.legacyColumn === oldName)) ||
          (m.targetDatasetId === datasetId && m.columnMappings.some(cp => cp.targetColumn === oldName)));
        if (colAffected.length) {
          const updates = colAffected.map(m => ({
            ...m,
            columnMappings: m.columnMappings.map(cp => ({
              legacyColumn: m.legacyDatasetId === datasetId && cp.legacyColumn === oldName ? nm : cp.legacyColumn,
              targetColumn: m.targetDatasetId === datasetId && cp.targetColumn === oldName ? nm : cp.targetColumn,
            })),
            updatedAt: new Date().toISOString(),
          }));
          for (const m of updates) await Repository.saveTableMapping(m);
          set((s) => {
            const mappings = { ...s.mappings };
            for (const m of updates) mappings[m.id] = m;
            return { mappings };
          });
        }

        await logEdit('EDIT_COLUMN_META', `${datasetId}.${nm}`, { name: oldName }, { name: nm });
        return null;
      }
    }),
    {
      partialize: (state) => ({ nodes: state.nodes }),
    }
  )
);

// Persist the active selection (not the graph data) so a reload can restore it.
// Only writes when one of the tracked fields actually changes — node drags etc.
// don't touch storage.
useStore.subscribe((state, prev) => {
  if (
    state.view === prev.view &&
    state.activeProjectId === prev.activeProjectId &&
    state.activeCanvasId === prev.activeCanvasId &&
    state.activeComparisonId === prev.activeComparisonId &&
    state.activeSystemTab === prev.activeSystemTab
  ) return;
  try {
    const session: PersistedSession = {
      view: state.view,
      activeProjectId: state.activeProjectId,
      activeCanvasId: state.activeCanvasId,
      activeComparisonId: state.activeComparisonId,
      activeSystemTab: state.activeSystemTab,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* storage unavailable — non-fatal */ }
});
