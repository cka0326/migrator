import Dexie, { type Table } from 'dexie';
import type { TableNode, ProcessRec, TableEdge, ColumnEdge, UploadRec, EditEvent } from '../types/models';

export class LineageDatabase extends Dexie {
  tableNodes!: Table<TableNode, string>; // datasetId is the primary key
  processRecs!: Table<ProcessRec, string>; // processId
  tableEdges!: Table<TableEdge, string>; // edgeId
  columnEdges!: Table<ColumnEdge, string>; // edgeId
  uploadRecs!: Table<UploadRec, string>; // uploadId
  editEvents!: Table<EditEvent, string>; // id

  constructor() {
    super('LineageCanvasDB');
    this.version(1).stores({
      tableNodes: 'datasetId, system, name, origin, completeness',
      processRecs: 'processId, uploadId',
      tableEdges: 'edgeId, uploadId, fromDataset, toDataset',
      columnEdges: 'edgeId, uploadId, target.datasetId',
      uploadRecs: 'uploadId, kind, status',
      editEvents: 'id, at, entityRef, action'
    });
  }
}

export const db = new LineageDatabase();
