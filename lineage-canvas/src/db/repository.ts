import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import type { TableNode, UploadRec, EditEvent, Project, Canvas, SavedComparison, TableMapping } from '../types/models';

export const Repository = {
  // ---------- Projects ----------
  async getAllProjects() {
    return db.projects.toArray();
  },

  async getProject(projectId: string) {
    return db.projects.get(projectId);
  },

  async getComparison(id: string) {
    return db.comparisons.get(id);
  },

  async saveProject(project: Project) {
    await db.projects.put(project);
  },

  async deleteProject(projectId: string) {
    const canvases = await db.canvases.where('projectId').equals(projectId).toArray();
    for (const c of canvases) {
      await Repository.deleteCanvas(c.id);
    }
    await db.comparisons.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  },

  // ---------- Saved comparisons ----------
  async getAllComparisons() {
    return db.comparisons.toArray();
  },

  async getComparisonsByProject(projectId: string) {
    return db.comparisons.where('projectId').equals(projectId).toArray();
  },

  async saveComparison(comparison: SavedComparison) {
    await db.comparisons.put(comparison);
  },

  async deleteComparison(id: string) {
    await db.comparisons.delete(id);
  },

  // ---------- Canvas table mappings (legacy ↔ target) ----------
  async getTableMappingsByCanvas(canvasId: string) {
    return db.tableMappings.where('canvasId').equals(canvasId).toArray();
  },

  async saveTableMapping(mapping: TableMapping) {
    await db.tableMappings.put(mapping);
  },

  async deleteTableMapping(id: string) {
    await db.tableMappings.delete(id);
  },

  // ---------- Canvases ----------
  async getCanvasesByProject(projectId: string) {
    return db.canvases.where('projectId').equals(projectId).toArray();
  },

  async getAllCanvases() {
    return db.canvases.toArray();
  },

  async getCanvas(canvasId: string) {
    return db.canvases.get(canvasId);
  },

  async saveCanvas(canvas: Canvas) {
    await db.canvases.put(canvas);
  },

  async deleteCanvas(canvasId: string) {
    await db.transaction('rw',
      [db.canvases, db.tableNodes, db.tableEdges, db.columnEdges, db.processRecs, db.uploadRecs, db.tableMappings],
      async () => {
        await db.tableNodes.where('canvasId').equals(canvasId).delete();
        await db.tableEdges.where('canvasId').equals(canvasId).delete();
        await db.columnEdges.where('canvasId').equals(canvasId).delete();
        await db.processRecs.where('canvasId').equals(canvasId).delete();
        await db.uploadRecs.where('canvasId').equals(canvasId).delete();
        await db.tableMappings.where('canvasId').equals(canvasId).delete();
        await db.canvases.delete(canvasId);
      });
  },

  // ---------- Canvas-scoped reads ----------
  async getTableNodesByCanvas(canvasId: string) {
    return db.tableNodes.where('canvasId').equals(canvasId).toArray();
  },

  async getTableEdgesByCanvas(canvasId: string) {
    return db.tableEdges.where('canvasId').equals(canvasId).toArray();
  },

  async getColumnEdgesByCanvas(canvasId: string) {
    return db.columnEdges.where('canvasId').equals(canvasId).toArray();
  },

  async getProcessRecsByCanvas(canvasId: string) {
    return db.processRecs.where('canvasId').equals(canvasId).toArray();
  },

  async getUploadsByCanvas(canvasId: string) {
    return db.uploadRecs.where('canvasId').equals(canvasId).toArray();
  },

  // Deep-copy every row owned by oldCanvasId into newCanvasId, remapping all
  // scoped ids. datasetIds/processIds are "${canvasId}::..." so a prefix swap
  // re-scopes them; edgeIds and uploadIds are regenerated to stay globally unique.
  async copyCanvasContents(oldCanvasId: string, newCanvasId: string) {
    const [nodes, tEdges, cEdges, procs, uploads, mappings] = await Promise.all([
      db.tableNodes.where('canvasId').equals(oldCanvasId).toArray(),
      db.tableEdges.where('canvasId').equals(oldCanvasId).toArray(),
      db.columnEdges.where('canvasId').equals(oldCanvasId).toArray(),
      db.processRecs.where('canvasId').equals(oldCanvasId).toArray(),
      db.uploadRecs.where('canvasId').equals(oldCanvasId).toArray(),
      db.tableMappings.where('canvasId').equals(oldCanvasId).toArray(),
    ]);

    const prefix = `${oldCanvasId}::`;
    const swap = (id: string) => id.startsWith(prefix) ? `${newCanvasId}::${id.slice(prefix.length)}` : id;

    const uploadIdMap = new Map<string, string>();
    for (const u of uploads) uploadIdMap.set(u.uploadId, uuidv4());
    const mapUpload = (uid: string) => uploadIdMap.get(uid) ?? uid;

    const newNodes = nodes.map(n => ({
      ...n,
      datasetId: swap(n.datasetId),
      canvasId: newCanvasId,
      createdByUploadId: n.createdByUploadId ? mapUpload(n.createdByUploadId) : undefined,
      referencedByUploadIds: (n.referencedByUploadIds || []).map(mapUpload),
    }));

    const newTEdges = tEdges.map(e => ({
      ...e,
      edgeId: `${newCanvasId}::${uuidv4()}`,
      canvasId: newCanvasId,
      uploadId: mapUpload(e.uploadId),
      fromDataset: swap(e.fromDataset),
      toDataset: swap(e.toDataset),
      processId: swap(e.processId),
    }));

    const newCEdges = cEdges.map(e => ({
      ...e,
      edgeId: `${newCanvasId}::${uuidv4()}`,
      canvasId: newCanvasId,
      uploadId: mapUpload(e.uploadId),
      target: { datasetId: swap(e.target.datasetId), column: e.target.column },
      sources: e.sources.map(s => ({ datasetId: swap(s.datasetId), column: s.column })),
      processId: swap(e.processId),
    }));

    const newProcs = procs.map(p => ({
      ...p,
      processId: swap(p.processId),
      canvasId: newCanvasId,
      uploadId: mapUpload(p.uploadId),
      inputs: p.inputs.map(swap),
      outputs: p.outputs.map(swap),
    }));

    const newUploads = uploads.map(u => ({
      ...u,
      uploadId: mapUpload(u.uploadId),
      canvasId: newCanvasId,
    }));

    // Mappings: fresh id, re-scope the canvas + dataset prefixes; column pairs (names)
    // carry over verbatim since the copied tables keep the same column names.
    const newMappings = mappings.map(m => ({
      ...m,
      id: uuidv4(),
      canvasId: newCanvasId,
      legacyDatasetId: swap(m.legacyDatasetId),
      targetDatasetId: swap(m.targetDatasetId),
      columnMappings: m.columnMappings.map(cp => ({ ...cp })),
    }));

    await db.transaction('rw',
      [db.tableNodes, db.tableEdges, db.columnEdges, db.processRecs, db.uploadRecs, db.tableMappings],
      async () => {
        if (newNodes.length) await db.tableNodes.bulkPut(newNodes);
        if (newTEdges.length) await db.tableEdges.bulkPut(newTEdges);
        if (newCEdges.length) await db.columnEdges.bulkPut(newCEdges);
        if (newProcs.length) await db.processRecs.bulkPut(newProcs);
        if (newUploads.length) await db.uploadRecs.bulkPut(newUploads);
        if (newMappings.length) await db.tableMappings.bulkPut(newMappings);
      });
  },

  // ---------- Table nodes ----------
  async getTableNode(datasetId: string) {
    return db.tableNodes.get(datasetId);
  },

  async saveTableNode(node: TableNode) {
    await db.tableNodes.put(node);
  },

  async deleteTableNode(datasetId: string) {
    await db.transaction('rw', [db.tableNodes, db.tableEdges, db.columnEdges], async () => {
      await db.tableNodes.delete(datasetId);
      // Cascade delete edges referencing this dataset
      await db.tableEdges.where('fromDataset').equals(datasetId).delete();
      await db.tableEdges.where('toDataset').equals(datasetId).delete();

      const columnEdges = await db.columnEdges.toArray();
      const edgeIdsToDelete = columnEdges
        .filter(ce => ce.target.datasetId === datasetId || ce.sources.some(s => s.datasetId === datasetId))
        .map(ce => ce.edgeId);

      await db.columnEdges.bulkDelete(edgeIdsToDelete);
    });
  },

  // ---------- Uploads ----------
  async getUploads() {
    return db.uploadRecs.toArray();
  },

  async saveUpload(upload: UploadRec) {
    await db.uploadRecs.put(upload);
  },

  async deleteUpload(uploadId: string) {
    // Removing a lineage upload removes the edges/processes it created and any stub nodes it created
    // unless another active upload references them. NEVER deletes EXCEL/MANUAL nodes.
    await db.transaction('rw', [db.uploadRecs, db.processRecs, db.tableEdges, db.columnEdges, db.tableNodes], async () => {
      await db.processRecs.where('uploadId').equals(uploadId).delete();
      await db.tableEdges.where('uploadId').equals(uploadId).delete();
      await db.columnEdges.where('uploadId').equals(uploadId).delete();

      const nodes = await db.tableNodes.toArray();
      const nodesToDelete: string[] = [];
      const nodesToUpdate: TableNode[] = [];

      for (const node of nodes) {
        if (node.createdByUploadId === uploadId && node.origin === 'STUB' && node.referencedByUploadIds.length <= 1) {
           nodesToDelete.push(node.datasetId);
        } else if (node.referencedByUploadIds.includes(uploadId)) {
           node.referencedByUploadIds = node.referencedByUploadIds.filter(id => id !== uploadId);
           nodesToUpdate.push(node);
        }
      }

      if (nodesToDelete.length > 0) {
        await db.tableNodes.bulkDelete(nodesToDelete);
      }
      if (nodesToUpdate.length > 0) {
        await db.tableNodes.bulkPut(nodesToUpdate);
      }

      await db.uploadRecs.delete(uploadId);
    });
  },

  // ---------- Bundle import (additive — never clears existing data) ----------
  // A project bundle arrives with freshly-remapped ids, so a straight bulkPut is safe.
  async saveImportedProjectBundle(g: {
    project: Project;
    canvases: Canvas[];
    comparisons: SavedComparison[];
    tableMappings: TableMapping[];
    tableNodes: any[];
    tableEdges: any[];
    columnEdges: any[];
    processRecs: any[];
    uploadRecs: any[];
  }) {
    await db.transaction('rw',
      [db.projects, db.canvases, db.comparisons, db.tableMappings, db.tableNodes, db.tableEdges, db.columnEdges, db.processRecs, db.uploadRecs],
      async () => {
        await db.projects.put(g.project);
        if (g.canvases.length) await db.canvases.bulkPut(g.canvases);
        if (g.comparisons.length) await db.comparisons.bulkPut(g.comparisons);
        if (g.tableMappings.length) await db.tableMappings.bulkPut(g.tableMappings);
        if (g.tableNodes.length) await db.tableNodes.bulkPut(g.tableNodes);
        if (g.tableEdges.length) await db.tableEdges.bulkPut(g.tableEdges);
        if (g.columnEdges.length) await db.columnEdges.bulkPut(g.columnEdges);
        if (g.processRecs.length) await db.processRecs.bulkPut(g.processRecs);
        if (g.uploadRecs.length) await db.uploadRecs.bulkPut(g.uploadRecs);
      });
  },

  // A comparison bundle keeps original ids: insert any referenced projects/canvases/
  // tables that are MISSING locally (so we never clobber the recipient's edits), then
  // add the comparison record itself.
  async saveImportedComparison(g: {
    comparison: SavedComparison;
    projects: Project[];
    canvases: Canvas[];
    tableNodes: any[];
    tableEdges: any[];
    columnEdges: any[];
  }) {
    const addMissing = async (table: any, rows: any[], key: string) => {
      if (!rows.length) return;
      const found = await table.bulkGet(rows.map(r => r[key]));
      const toAdd = rows.filter((_, i) => !found[i]);
      if (toAdd.length) await table.bulkPut(toAdd);
    };
    await db.transaction('rw',
      [db.projects, db.canvases, db.comparisons, db.tableNodes, db.tableEdges, db.columnEdges],
      async () => {
        await addMissing(db.projects, g.projects, 'id');
        await addMissing(db.canvases, g.canvases, 'id');
        await addMissing(db.tableNodes, g.tableNodes, 'datasetId');
        await addMissing(db.tableEdges, g.tableEdges, 'edgeId');
        await addMissing(db.columnEdges, g.columnEdges, 'edgeId');
        await db.comparisons.put(g.comparison);
      });
  },

  async logEditEvent(event: EditEvent) {
    await db.editEvents.put(event);
  },

  async getEditEvents() {
    return db.editEvents.orderBy('at').toArray();
  }
};
