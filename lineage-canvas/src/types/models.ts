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

// ---------- comprehensive TABLE-level metadata (all optional, filled incrementally) ----------
export interface TableMetadata {
  objectType: "TABLE" | "VIEW" | "EXTERNAL" | "DATASET"; // editable
  role?: "SOURCE" | "INTERMEDIATE" | "TARGET";
  isTemporary?: boolean;
  businessName?: string;          // friendly/display name
  description?: string;           // long text
  owner?: string;
  steward?: string;               // data steward
  domain?: string;                // business domain (e.g., Claims, Policy, Billing)
  classification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "PII" | "PHI";
  sourceSystem?: string;          // system of record (e.g., "Guidewire", "Legacy SAS") — distinct from the lane
  recordCount?: number;           // table row count
  grain?: string;                 // granularity, e.g. "one row per policy per term"
  refreshFrequency?: "REAL_TIME" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND" | "STATIC";
  physicalLocation?: string;      // path / database location
  tags?: string[];
  notes?: string;                 // free text
  lastProfiledAt?: string;        // when stats were last computed/entered
}

// ---------- column statistics ----------
export interface ColumnStat {
  recordCount?: number;
  nullCount?: number;
  distinctCount?: number;
  min?: string | number;
  max?: string | number;
  mean?: number;
  stdDev?: number;
  sampleValues?: string[];
}

// ---------- comprehensive COLUMN-level metadata ----------
export interface ColumnMetadata {
  businessName?: string;
  description?: string;
  classification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "PII" | "PHI";
  platform?: string;              // target platform / system (e.g., "Redshift", "Snowflake", "BigQuery")
  pii?: boolean;                  // separate PII flag indicator
  nullable?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignKeyRef?: string;         // "SYSTEM:QUALIFIED_NAME.COLUMN" it references
  defaultValue?: string;
  length?: number;                // for character types
  precision?: number;             // for numeric types
  scale?: number;
  allowedValues?: string;         // enumerated domain / description
  format?: string;                // e.g., "YYYY-MM-DD", "$#,##0.00"
  unit?: string;                  // e.g., "USD", "days"
  tags?: string[];
  notes?: string;
}

export interface ColumnDef {
  name: string;                   // UPPERCASE canonical (unless quoted) — IMMUTABLE identity within the node
  dataType: string;               // logical/physical type; "UNKNOWN" until enriched
  ordinal: number;                // editable (reorder)
  quoted?: boolean;
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
  origin: "STUB" | "EXCEL" | "MANUAL"; // how the node first appeared
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
