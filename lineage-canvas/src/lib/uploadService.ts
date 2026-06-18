import { db } from '../db/database';
import { ingestLineageJSON } from '../db/ingestion';
import type { TableNode } from '../types/models';

export async function processLineageUpload(file: File) {
  const content = await file.text();
  
  const existingUploads = await db.uploadRecs
    .where('fileName').equals(file.name)
    .filter(u => u.status === 'ACTIVE' && u.kind === 'LINEAGE_JSON')
    .toArray();

  if (existingUploads.length > 0) {
    const shouldSupersede = window.confirm(
      `An active upload for "${file.name}" already exists. Do you want to supersede it? (Cancel will ingest it alongside the existing one)`
    );

    if (shouldSupersede) {
      for (const oldUpload of existingUploads) {
        await db.transaction('rw', [db.uploadRecs, db.processRecs, db.tableEdges, db.columnEdges, db.tableNodes], async () => {
           await db.processRecs.where('uploadId').equals(oldUpload.uploadId).delete();
           await db.tableEdges.where('uploadId').equals(oldUpload.uploadId).delete();
           await db.columnEdges.where('uploadId').equals(oldUpload.uploadId).delete();
           
           const nodes = await db.tableNodes.toArray();
           const nodesToDelete: string[] = [];
           const nodesToUpdate: TableNode[] = [];
           for (const node of nodes) {
              if (node.createdByUploadId === oldUpload.uploadId && node.origin === 'STUB' && node.referencedByUploadIds.length <= 1) {
                 nodesToDelete.push(node.datasetId);
              } else if (node.referencedByUploadIds.includes(oldUpload.uploadId)) {
                 node.referencedByUploadIds = node.referencedByUploadIds.filter(id => id !== oldUpload.uploadId);
                 nodesToUpdate.push(node);
              }
           }
           if (nodesToDelete.length > 0) await db.tableNodes.bulkDelete(nodesToDelete);
           if (nodesToUpdate.length > 0) await db.tableNodes.bulkPut(nodesToUpdate);
           
           await db.uploadRecs.update(oldUpload.uploadId, { status: 'SUPERSEDED' });
        });
      }
    }
  }

  await ingestLineageJSON(content, file.name);
}
