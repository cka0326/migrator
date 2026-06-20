export type System = "LEGACY" | "TARGET";

// ---------- Project / Canvas hierarchy ----------
export interface Project {
  id: string;                     // uuid
  name: string;
  legacySystemName: string;       // display label for the LEGACY system (e.g., "SAS", "Mainframe")
  targetSystemName: string;       // display label for the TARGET system (e.g., "Snowflake", "BigQuery")
  createdAt: string;
  updatedAt: string;
}

export interface Canvas {
  id: string;                     // uuid — also the scope prefix for all datasetIds it owns
  projectId: string;
  name: string;                   // a point-in-time snapshot name (e.g., "2024-Q1", "As-Is")
  createdAt: string;
  updatedAt: string;
}

// ---------- Saved comparison views ----------
export interface ComparisonEndpoint {
  datasetId: string;              // encodes the owning canvasId as its "${canvasId}::" prefix
  column?: string;                // only used in COLUMNS mode
}

export interface ColumnPair {
  left: ComparisonEndpoint;       // { datasetId, column }
  right: ComparisonEndpoint;      // { datasetId, column }
}

export type ComparisonMode = "systems" | "projects" | "columns";

export interface SavedComparison {
  id: string;                     // uuid
  projectId: string;
  name: string;
  mode: ComparisonMode;
  left?: ComparisonEndpoint;      // table endpoints for systems/snapshots modes
  right?: ComparisonEndpoint;
  columnPairs?: ColumnPair[];     // manual column pairings for columns mode
  createdAt: string;
  updatedAt: string;
}

// ---------- TABLE-level metadata (see meta_data_capture.md; all optional, filled incrementally) ----------
// table_name and name_space live on TableNode itself (name / namespace).
export type Environment = "DEV" | "TEST" | "UAT" | "PROD";
export type RefreshFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "AD_HOC";

export interface TableMetadata {
  description?: string;            // description of the table
  environment?: Environment;       // DEV | TEST | UAT | PROD
  businessDomain?: string;         // e.g. Claims, Policy, Billing, Finance
  rowCount?: number;               // count of rows in the table
  columnCount?: number;            // count of columns in the table
  hasPrimaryKey?: boolean;         // whether the table has a primary key
  uniqueKeyColumns?: string;       // comma-separated list of column names
  grainDescription?: string;       // description of the grain of the table
  refreshFrequency?: RefreshFrequency; // DAILY | WEEKLY | MONTHLY | AD_HOC
}

// ---------- column profiling statistics (see meta_data_capture.md) ----------
export interface ColumnStat {
  nullCount?: number;             // count of null values
  minValue?: string;              // minimum value
  maxValue?: string;              // maximum value
  uniqueCount?: number;           // count of unique values
  uniques?: string;               // comma-separated list of unique values
  meanValue?: number;             // mean value
  stddevValue?: number;           // standard deviation
  sumValue?: number;              // sum of values
}

// ---------- COLUMN-level metadata (see meta_data_capture.md) ----------
// column_name / data_type live on ColumnDef; table_name / name_space on the parent TableNode.
export interface ColumnMetadata {
  nullable?: boolean;             // whether the column allows NULLs
  maxLength?: number;             // maximum length of the column
  precision?: number;             // numeric precision
  defaultValue?: string;          // default value
  columnDefinition?: string;      // definition of the column
  columnComputationFormula?: string; // formula for computing the column
}

export interface ColumnDef {
  name: string;                   // UPPERCASE canonical — IMMUTABLE identity within the node
  dataType: string;               // logical/physical type; "UNKNOWN" until enriched
  ordinal: number;                // editable (reorder)
  origin: "LINEAGE" | "EXCEL" | "MANUAL";
  metadata: ColumnMetadata;
  stats: ColumnStat;
  createdByUploadId?: string;
  lastEditedBy?: "USER" | "UPLOAD";
}

export interface TableNode {
  datasetId: string;              // "${canvasId}::SYSTEM:QUALIFIED_NAME" — globally unique identity + React Flow node id (IMMUTABLE)
  canvasId: string;               // owning canvas (IMMUTABLE)
  system: System;                 // LEGACY | TARGET tab (IMMUTABLE)
  namespace: string;              // SAS library | "DATABASE.SCHEMA" (IMMUTABLE)
  name: string;                   // table/dataset name (IMMUTABLE)
  qualifiedName: string;          // canonical UPPERCASE
  origin: "STUB" | "EXCEL" | "MANUAL" | "IMPORT"; // how the node first appeared (IMPORT = from a JSON lineage extract)
  completeness: "STUB" | "PARTIAL" | "COMPLETE"; // derived (§9)
  metadata: TableMetadata;
  columns: ColumnDef[];
  createdByUploadId?: string;     // if first created by a lineage upload
  referencedByUploadIds: string[];// every lineage upload that references it
  position?: { x: number; y: number };
  collapsed?: boolean;            // manual toggle for row list visibility
  lastEditedBy?: "USER" | "UPLOAD";
  createdAt: string;
  updatedAt: string;
}

export interface ProcessRec {            // a transformation/step from a lineage extract
  processId: string;
  canvasId: string;               // owning canvas
  uploadId: string;               // provenance
  sequence: number;
  name: string;
  operationType: string;          // SAS_DATA_STEP | SF_CTAS | ...
  sourceFile: string;
  codeLocation?: { startLine: number | null; endLine: number | null };
  inputs: string[];               // datasetIds
  outputs: string[];              // datasetIds
  description?: string;
  snippet?: string;
}

export interface TableEdge {
  edgeId: string;
  canvasId: string;               // owning canvas
  uploadId: string;               // provenance
  fromDataset: string;            // datasetId
  toDataset: string;              // datasetId
  processId: string;
}

export interface ColumnEdge {
  edgeId: string;
  canvasId: string;               // owning canvas
  uploadId: string;               // provenance
  target: { datasetId: string; column: string };
  sources: { datasetId: string; column: string }[];
  processId: string;
  transformationType: "DIRECT" | "RENAME" | "CAST" | "EXPRESSION"
    | "AGGREGATION" | "WINDOW" | "CASE" | "CONSTANT" | "UNKNOWN";
  expression?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
}

export interface UploadRec {             // the provenance registry — one row per upload event
  uploadId: string;               // app-generated UUID, stamped onto everything it creates
  canvasId: string;               // owning canvas
  kind: "EXCEL" | "LINEAGE_JSON";
  fileName: string;
  system?: System;                // for JSON: the extract's source_system
  uploadedAt: string;
  status: "ACTIVE" | "SUPERSEDED";
  summary: { datasets?: number; processes?: number; tableEdges?: number; columnEdges?: number; stubsCreated?: number; };
  rawPayload: string;             // original file content (JSON string / base64 workbook) for audit + re-processing
  supersedesUploadId?: string;
}

export interface EditEvent {             // append-only manual-edit log (§9)
  id: string; at: string; actor: "USER";
  entity: "NODE" | "COLUMN" | "EDGE" | "MAPPING";
  entityRef: string;              // datasetId / `${datasetId}.${column}` / edgeId
  action: "ADD_NODE" | "DELETE_NODE" | "EDIT_TABLE_META" | "ADD_COLUMN"
        | "REMOVE_COLUMN" | "EDIT_COLUMN_META" | "EDIT_COLUMN_STATS" | "REORDER"
        | "ADD_EDGE" | "DELETE_EDGE";
  before?: unknown; after?: unknown;
}

export interface MigrationMapping {      // optional cross-lane link (§10)
  id: string; sasDatasetId: string; snowflakeDatasetId: string;
  status: "PROPOSED" | "VALIDATED" | "MISMATCH"; notes?: string;
}
