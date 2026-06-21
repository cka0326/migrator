// A source-agnostic model of an import (JSON extract or Excel workbook), produced by
// the parsers (parseLineageExtract, parseExcelWorkbook) and consumed by the unified
// writer ingestParsedModel (src/db/ingestion.ts). The validation UI sits in between:
// it edits this model (namespaces, table metadata, target) before anything is written.

import type { System, TableMetadata, ColumnMetadata, ColumnStat } from '../types/models';

export interface ParsedColumn {
  name: string;                       // UPPERCASE
  dataType?: string;
  metadata?: Partial<ColumnMetadata>; // Excel only
  stats?: Partial<ColumnStat>;        // Excel only
}

export interface ParsedTable {
  name: string;                       // UPPERCASE; unique within an import — the key connections reference
  namespace: string;                  // UPPERCASE; defaults to 'DEFAULT_UNKNOWN'
  system?: System;                    // Excel may specify per-table; JSON omits (uses the target's default system)
  columns: ParsedColumn[];
  metadata?: Partial<TableMetadata>;  // Excel-provided or entered in the validation UI
}

export interface ParsedTableConnection { from: string; to: string }            // table names
export interface ParsedColumnRef { table: string; column: string }             // table name + column
export interface ParsedColumnConnection { target: ParsedColumnRef; sources: ParsedColumnRef[] }

export interface ParsedImportModel {
  source: 'JSON' | 'EXCEL';
  tables: ParsedTable[];
  tableConnections: ParsedTableConnection[];
  columnConnections: ParsedColumnConnection[];
  // Hints for the validation UI's target picker (Excel MASTER sheet may carry these).
  projectHint?: { name?: string; legacySystemName?: string; targetSystemName?: string };
  canvasHint?: string;
}

export const DEFAULT_NAMESPACE = 'DEFAULT_UNKNOWN';

// How an import treats tables that already exist.
//  - 'additive'                      : add tables/columns/connections; never touch existing metadata or connections.
//  - 'override-metadata'             : additive, plus overwrite existing table/column metadata with the import's.
//  - 'override-metadata-connections' : like override-metadata, and REPLACE the affected tables' connections.
export type ImportMode = 'additive' | 'override-metadata' | 'override-metadata-connections';

export interface ImportTarget {
  canvasId: string;
  defaultSystem: System;   // applied to tables that don't specify their own system (all JSON tables)
}

export interface ImportOptions {
  mode: ImportMode;
  fileName: string;
  kind: 'EXCEL' | 'LINEAGE_JSON';
  rawPayload?: string;     // stored on the UploadRec for audit (JSON text); optional for large workbooks
}

export interface ImportSummary {
  tables: number;
  newTables: number;
  columnsAdded: number;
  tableEdges: number;
  columnEdges: number;
  stubsCreated: number;
}
