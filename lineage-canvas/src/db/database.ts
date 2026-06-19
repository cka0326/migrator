import Dexie, { type Table } from 'dexie';
import type { TableNode, ProcessRec, TableEdge, ColumnEdge, UploadRec, EditEvent, Project, Canvas, SavedComparison } from '../types/models';

export class LineageDatabase extends Dexie {
  projects!: Table<Project, string>; // id
  canvases!: Table<Canvas, string>; // id
  comparisons!: Table<SavedComparison, string>; // id
  tableNodes!: Table<TableNode, string>; // datasetId is the primary key
  processRecs!: Table<ProcessRec, string>; // processId
  tableEdges!: Table<TableEdge, string>; // edgeId
  columnEdges!: Table<ColumnEdge, string>; // edgeId
  uploadRecs!: Table<UploadRec, string>; // uploadId
  editEvents!: Table<EditEvent, string>; // id

  constructor() {
    // New DB name => clean fresh start (legacy SAS/Snowflake data is abandoned).
    super('LineageCanvasDB_v2');
    this.version(1).stores({
      projects: 'id, name',
      canvases: 'id, projectId',
      tableNodes: 'datasetId, canvasId, system, name, origin, completeness',
      processRecs: 'processId, canvasId, uploadId',
      tableEdges: 'edgeId, canvasId, uploadId, fromDataset, toDataset',
      columnEdges: 'edgeId, canvasId, uploadId, target.datasetId',
      uploadRecs: 'uploadId, canvasId, kind, status',
      editEvents: 'id, at, entityRef, action'
    });
    // v2 adds saved comparison views.
    this.version(2).stores({
      comparisons: 'id, projectId'
    });
  }
}

export const db = new LineageDatabase();
