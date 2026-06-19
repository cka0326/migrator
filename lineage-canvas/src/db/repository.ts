import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import type { TableNode, UploadRec, EditEvent, Project, Canvas, SavedComparison } from '../types/models';

export const Repository = {
  // ---------- Projects ----------
  async getAllProjects() {
    return db.projects.toArray();
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

  // ---------- Canvases ----------
  async getCanvasesByProject(projectId: string) {
    return db.canvases.where('projectId').equals(projectId).toArray();
  },

  async getAllCanvases() {
    return db.canvases.toArray();
  },

  async saveCanvas(canvas: Canvas) {
    await db.canvases.put(canvas);
  },

  async deleteCanvas(canvasId: string) {
    await db.transaction('rw',
      [db.canvases, db.tableNodes, db.tableEdges, db.columnEdges, db.processRecs, db.uploadRecs],
      async () => {
        await db.tableNodes.where('canvasId').equals(canvasId).delete();
        await db.tableEdges.where('canvasId').equals(canvasId).delete();
        await db.columnEdges.where('canvasId').equals(canvasId).delete();
        await db.processRecs.where('canvasId').equals(canvasId).delete();
        await db.uploadRecs.where('canvasId').equals(canvasId).delete();
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

  // Deep-copy every row owned by oldCanvasId into newCanvasId, remapping all
  // scoped ids. datasetIds/processIds are "${canvasId}::..." so a prefix swap
  // re-scopes them; edgeIds and uploadIds are regenerated to stay globally unique.
  async copyCanvasContents(oldCanvasId: string, newCanvasId: string) {
    const [nodes, tEdges, cEdges, procs, uploads] = await Promise.all([
      db.tableNodes.where('canvasId').equals(oldCanvasId).toArray(),
      db.tableEdges.where('canvasId').equals(oldCanvasId).toArray(),
      db.columnEdges.where('canvasId').equals(oldCanvasId).toArray(),
      db.processRecs.where('canvasId').equals(oldCanvasId).toArray(),
      db.uploadRecs.where('canvasId').equals(oldCanvasId).toArray(),
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

    await db.transaction('rw',
      [db.tableNodes, db.tableEdges, db.columnEdges, db.processRecs, db.uploadRecs],
      async () => {
        if (newNodes.length) await db.tableNodes.bulkPut(newNodes);
        if (newTEdges.length) await db.tableEdges.bulkPut(newTEdges);
        if (newCEdges.length) await db.columnEdges.bulkPut(newCEdges);
        if (newProcs.length) await db.processRecs.bulkPut(newProcs);
        if (newUploads.length) await db.uploadRecs.bulkPut(newUploads);
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

  // ---------- Workspace export / import ----------
  async getWorkspaceExport() {
    const projects = await db.projects.toArray();
    const canvases = await db.canvases.toArray();
    const comparisons = await db.comparisons.toArray();
    const tableNodes = await db.tableNodes.toArray();
    const processRecs = await db.processRecs.toArray();
    const tableEdges = await db.tableEdges.toArray();
    const columnEdges = await db.columnEdges.toArray();
    const uploadRecs = await db.uploadRecs.toArray();
    const editEvents = await db.editEvents.toArray();

    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: {
        projects,
        canvases,
        comparisons,
        tableNodes,
        processRecs,
        tableEdges,
        columnEdges,
        uploadRecs,
        editEvents
      }
    };
  },

  async importWorkspace(workspaceData: any) {
    const { data } = workspaceData;
    await db.transaction('rw',
      [db.projects, db.canvases, db.comparisons, db.tableNodes, db.processRecs, db.tableEdges, db.columnEdges, db.uploadRecs, db.editEvents],
      async () => {
        await db.projects.clear();
        await db.canvases.clear();
        await db.comparisons.clear();
        await db.tableNodes.clear();
        await db.processRecs.clear();
        await db.tableEdges.clear();
        await db.columnEdges.clear();
        await db.uploadRecs.clear();
        await db.editEvents.clear();

        if (data.projects?.length) await db.projects.bulkAdd(data.projects);
        if (data.canvases?.length) await db.canvases.bulkAdd(data.canvases);
        if (data.comparisons?.length) await db.comparisons.bulkAdd(data.comparisons);
        if (data.tableNodes?.length) await db.tableNodes.bulkAdd(data.tableNodes);
        if (data.processRecs?.length) await db.processRecs.bulkAdd(data.processRecs);
        if (data.tableEdges?.length) await db.tableEdges.bulkAdd(data.tableEdges);
        if (data.columnEdges?.length) await db.columnEdges.bulkAdd(data.columnEdges);
        if (data.uploadRecs?.length) await db.uploadRecs.bulkAdd(data.uploadRecs);
        if (data.editEvents?.length) await db.editEvents.bulkAdd(data.editEvents);
      });
  },

  async logEditEvent(event: EditEvent) {
    await db.editEvents.put(event);
  },

  async getEditEvents() {
    return db.editEvents.orderBy('at').toArray();
  }
};
