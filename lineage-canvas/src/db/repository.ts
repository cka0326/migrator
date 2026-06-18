import { db } from './database';
import type { TableNode, UploadRec, EditEvent } from '../types/models';

export const Repository = {
  async getAllTableNodes() {
    return db.tableNodes.toArray();
  },

  async getTableNode(datasetId: string) {
    return db.tableNodes.get(datasetId);
  },

  async getAllTableEdges() {
    return db.tableEdges.toArray();
  },

  async getAllColumnEdges() {
    return db.columnEdges.toArray();
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

  async getUploads() {
    return db.uploadRecs.toArray();
  },

  async saveUpload(upload: UploadRec) {
    await db.uploadRecs.put(upload);
  },

  async deleteUpload(uploadId: string) {
    // Implement cascade rules as per §5 and §8
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

  async getWorkspaceExport() {
    const tableNodes = await db.tableNodes.toArray();
    const processRecs = await db.processRecs.toArray();
    const tableEdges = await db.tableEdges.toArray();
    const columnEdges = await db.columnEdges.toArray();
    const uploadRecs = await db.uploadRecs.toArray();
    const editEvents = await db.editEvents.toArray();

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
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
    await db.transaction('rw', [db.tableNodes, db.processRecs, db.tableEdges, db.columnEdges, db.uploadRecs, db.editEvents], async () => {
      await db.tableNodes.clear();
      await db.processRecs.clear();
      await db.tableEdges.clear();
      await db.columnEdges.clear();
      await db.uploadRecs.clear();
      await db.editEvents.clear();

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
