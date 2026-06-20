import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { Repository } from '../db/repository';
import type {
  TableNode, ColumnDef, System, Project, Canvas,
  ProcessRec, TableEdge, ColumnEdge, UploadRec, TableMetadata,
} from '../types/models';

// Sheets the importer never treats as a table.
const RESERVED_SHEETS = new Set(['INSTRUCTIONS', 'MASTER']);
// Table-level metadata keys on a table sheet. table_name lives in the MASTER
// registry, not on the sheet.
const TABLE_META_KEYS = new Set([
  'system', 'namespace', 'description', 'environment', 'business_domain',
  'row_count', 'column_count', 'has_primary_key', 'unique_key_columns',
  'grain_description', 'refresh_frequency',
]);

type Row = any[];
const cell = (r: Row | undefined, i: number) => (r ? r[i] : undefined);
const str = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const bool = (v: any) => (v === undefined || v === null || v === '' ? undefined : str(v).toUpperCase() === 'TRUE');
const upper = (v: any) => str(v).toUpperCase();
// "UNASSIGNED" is the app's sentinel for "no value" (see DetailsPanel.tsx).
const enumVal = (v: any) => { const u = upper(v); return u && u !== 'UNASSIGNED' ? u : undefined; };

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Read a table sheet into its table-level metadata block + column rows. */
function parseTableSheet(rows: Row[]) {
  const meta: Record<string, any> = {};
  for (const row of rows) {
    const key = str(cell(row, 0));
    if (TABLE_META_KEYS.has(key)) meta[key] = cell(row, 1);
  }
  const headerIdx = rows.findIndex(r => str(cell(r, 0)) === 'column_name');
  const columns: Record<string, any>[] = [];
  if (headerIdx !== -1) {
    const headers = (rows[headerIdx] || []).map(h => str(h));
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!str(cell(row, 0))) continue;
      const obj: Record<string, any> = {};
      headers.forEach((h, idx) => { if (h) obj[h] = cell(row, idx); });
      columns.push(obj);
    }
  }
  return { meta, columns };
}

/** Read a stacked MASTER section (header row + the rows beneath it, up to endIdx). */
function readSection(rows: Row[], headerKey: string, endIdx: number) {
  const headerIdx = rows.findIndex(r => str(cell(r, 0)) === headerKey);
  if (headerIdx === -1) return [];
  const headers = (rows[headerIdx] || []).map(h => str(h));
  const stop = endIdx === -1 ? rows.length : endIdx;
  const out: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < stop; i++) {
    const row = rows[i];
    const first = str(cell(row, 0));
    if (!first || /^\d\)/.test(first)) continue; // skip blanks & section titles
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => { if (h) obj[h] = cell(row, idx); });
    out.push(obj);
  }
  return out;
}

function parseMaster(rows: Row[]) {
  const project: Record<string, any> = {};
  for (const row of rows) {
    const key = str(cell(row, 0));
    if (['project_name', 'legacy_system_name', 'target_system_name', 'canvas_name'].includes(key)) {
      project[key] = cell(row, 1);
    }
  }
  const tcIdx = rows.findIndex(r => str(cell(r, 0)) === 'from_table');
  const ccIdx = rows.findIndex(r => str(cell(r, 0)) === 'target_table');
  const registry = readSection(rows, 'sheet_name', tcIdx);
  const tableConnections = readSection(rows, 'from_table', ccIdx === -1 ? -1 : ccIdx);
  const columnConnections = readSection(rows, 'target_table', -1);
  return { project, registry, tableConnections, columnConnections };
}

// ---------------------------------------------------------------------------
// Node upsert
// ---------------------------------------------------------------------------

function buildTableMeta(meta: Record<string, any>, columnCount: number): TableMetadata {
  return {
    description: str(meta['description']) || undefined,
    environment: enumVal(meta['environment']) as any,
    businessDomain: str(meta['business_domain']) || undefined,
    rowCount: num(meta['row_count']),
    columnCount: num(meta['column_count']) ?? columnCount,
    hasPrimaryKey: bool(meta['has_primary_key']),
    uniqueKeyColumns: str(meta['unique_key_columns']) || undefined,
    grainDescription: str(meta['grain_description']) || undefined,
    refreshFrequency: enumVal(meta['refresh_frequency']) as any,
  };
}

async function upsertTable(canvasId: string, tableName: string, meta: Record<string, any>, columnRows: Record<string, any>[]) {
  const system = upper(meta['system']) as System;
  const namespace = upper(meta['namespace']);
  if (system !== 'LEGACY' && system !== 'TARGET') {
    throw new Error(`Table "${tableName}": system must be LEGACY or TARGET (got "${str(meta['system']) || 'blank'}").`);
  }
  if (!namespace) throw new Error(`Table "${tableName}": namespace is required on its sheet.`);

  const datasetId = `${canvasId}::${system}:${namespace}.${tableName}`;
  const existingNode = await db.tableNodes.get(datasetId);
  const columns: ColumnDef[] = existingNode ? [...existingNode.columns] : [];

  columnRows.forEach((row, idx) => {
    const colName = upper(row['column_name']);
    if (!colName) return;
    const existingCol = columns.find(c => c.name === colName);
    const newCol: ColumnDef = {
      name: colName,
      dataType: str(row['data_type']) || existingCol?.dataType || 'UNKNOWN',
      ordinal: existingCol?.ordinal || idx + 1,
      origin: existingCol ? (existingCol.origin === 'LINEAGE' ? 'EXCEL' : existingCol.origin) : 'EXCEL',
      metadata: {
        ...existingCol?.metadata,
        nullable: bool(row['nullable']) ?? existingCol?.metadata?.nullable,
        maxLength: num(row['max_length']) ?? existingCol?.metadata?.maxLength,
        precision: num(row['precision']) ?? existingCol?.metadata?.precision,
        defaultValue: str(row['default_value']) || existingCol?.metadata?.defaultValue,
        columnDefinition: str(row['column_definition']) || existingCol?.metadata?.columnDefinition,
        columnComputationFormula: str(row['column_computation_formula']) || existingCol?.metadata?.columnComputationFormula,
      },
      stats: {
        ...existingCol?.stats,
        nullCount: num(row['null_count']) ?? existingCol?.stats?.nullCount,
        minValue: str(row['min_value']) || existingCol?.stats?.minValue,
        maxValue: str(row['max_value']) || existingCol?.stats?.maxValue,
        uniqueCount: num(row['unique_count']) ?? existingCol?.stats?.uniqueCount,
        uniques: str(row['uniques']) || existingCol?.stats?.uniques,
        meanValue: num(row['mean_value']) ?? existingCol?.stats?.meanValue,
        stddevValue: num(row['stddev_value']) ?? existingCol?.stats?.stddevValue,
        sumValue: num(row['sum_value']) ?? existingCol?.stats?.sumValue,
      },
      lastEditedBy: 'UPLOAD',
    };
    const cIdx = columns.findIndex(c => c.name === colName);
    if (cIdx !== -1) columns[cIdx] = newCol; else columns.push(newCol);
  });

  const tableMeta = buildTableMeta(meta, columns.length);
  const now = new Date().toISOString();

  if (existingNode) {
    existingNode.columns = columns;
    existingNode.origin = existingNode.origin === 'STUB' ? 'EXCEL' : existingNode.origin;
    existingNode.metadata = {
      ...existingNode.metadata,
      ...Object.fromEntries(Object.entries(tableMeta).filter(([, v]) => v !== undefined)),
    };
    existingNode.updatedAt = now;
    await db.tableNodes.put(existingNode);
    return datasetId;
  }

  const newNode: TableNode = {
    datasetId,
    canvasId,
    system,
    namespace,
    name: tableName,
    qualifiedName: `${namespace}.${tableName}`,
    origin: 'EXCEL',
    completeness: 'PARTIAL',
    metadata: tableMeta,
    columns,
    referencedByUploadIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.tableNodes.put(newNode);
  return datasetId;
}

// ---------------------------------------------------------------------------
// Project / canvas resolution (from the MASTER sheet)
// ---------------------------------------------------------------------------

async function resolveCanvas(project: Record<string, any>, fallbackCanvasId: string | null): Promise<string> {
  const projectName = str(project['project_name']);
  if (!projectName) {
    if (!fallbackCanvasId) {
      throw new Error('No project_name on the MASTER sheet and no canvas is open. Set MASTER!project_name or open a canvas first.');
    }
    return fallbackCanvasId;
  }

  const now = new Date().toISOString();
  const projects = await Repository.getAllProjects();
  let proj = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
  if (!proj) {
    proj = {
      id: uuidv4(),
      name: projectName,
      legacySystemName: str(project['legacy_system_name']) || 'Legacy',
      targetSystemName: str(project['target_system_name']) || 'Target',
      createdAt: now,
      updatedAt: now,
    } as Project;
    await Repository.saveProject(proj);
  }

  const canvasName = str(project['canvas_name']) || 'Imported';
  const canvases = await Repository.getCanvasesByProject(proj.id);
  let canvas = canvases.find(c => c.name.toLowerCase() === canvasName.toLowerCase());
  if (!canvas) {
    canvas = { id: uuidv4(), projectId: proj.id, name: canvasName, createdAt: now, updatedAt: now } as Canvas;
    await Repository.saveCanvas(canvas);
  }
  return canvas.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ingest a multi-sheet template workbook. The MASTER registry lists which
 * sheets become tables (and their names); the MASTER connection sections
 * declare table- and column-level lineage between those tables. The MASTER
 * project section selects the project/canvas (created if missing).
 * Returns a summary of what was ingested, plus any non-fatal warnings.
 */
export interface ImportSummary {
  canvasId: string;
  tables: number;
  tableEdges: number;
  columnEdges: number;
  warnings: string[];
}

export async function processExcelUpload(file: File, fallbackCanvasId: string | null): Promise<ImportSummary> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);

  const masterWs = wb.Sheets['MASTER'];
  if (!masterWs) throw new Error('Missing MASTER sheet — please use the downloaded template.');
  const master = parseMaster(XLSX.utils.sheet_to_json<Row>(masterWs, { header: 1, blankrows: true }));

  const canvasId = await resolveCanvas(master.project, fallbackCanvasId);

  // Ingest exactly the tables named in the registry, and remember table_name -> datasetId.
  const nameToDataset = new Map<string, string>();        // TABLE_NAME (upper) -> datasetId
  for (const entry of master.registry) {
    const tableName = upper(entry['table_name']);
    if (!tableName) continue;                              // blank => skip this sheet
    const sheetName = str(entry['sheet_name']);
    if (RESERVED_SHEETS.has(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Registry lists sheet "${sheetName}" for table "${tableName}", but no such sheet exists.`);
    const { meta, columns } = parseTableSheet(XLSX.utils.sheet_to_json<Row>(ws, { header: 1, blankrows: true }));
    const datasetId = await upsertTable(canvasId, tableName, meta, columns);
    nameToDataset.set(tableName, datasetId);
  }

  const warnings: string[] = [];
  const unresolved = new Set<string>();
  const resolveRef = (ref: any): string | undefined => {
    const name = upper(ref);
    if (!name) return undefined;
    const ds = nameToDataset.get(name);
    if (!ds) unresolved.add(name);
    return ds;
  };

  const uploadId = uuidv4();
  const processRecs: ProcessRec[] = [];
  const tableEdges: TableEdge[] = [];
  const columnEdges: ColumnEdge[] = [];

  // Table-to-table connections.
  master.tableConnections.forEach((row, idx) => {
    const from = resolveRef(row['from_table']);
    const to = resolveRef(row['to_table']);
    if (!from || !to) return;
    const processId = `${canvasId}::${uuidv4()}`;
    processRecs.push({
      processId, canvasId, uploadId, sequence: idx + 1,
      name: `${upper(row['from_table'])} → ${upper(row['to_table'])}`,
      operationType: 'TABLE_LINEAGE',
      sourceFile: file.name,
      inputs: [from], outputs: [to],
      description: str(row['description']) || undefined,
    });
    tableEdges.push({ edgeId: `${canvasId}::${uuidv4()}`, canvasId, uploadId, fromDataset: from, toDataset: to, processId });
  });

  // Column-to-column connections, grouped by target column.
  const grouped = new Map<string, { target: { datasetId: string; column: string }; sources: { datasetId: string; column: string }[] }>();
  for (const row of master.columnConnections) {
    const targetDs = resolveRef(row['target_table']);
    const targetCol = upper(row['target_column']);
    const sourceDs = resolveRef(row['source_table']);
    const sourceCol = upper(row['source_column']);
    if (!targetDs || !targetCol) continue;
    const k = `${targetDs}::${targetCol}`;
    if (!grouped.has(k)) grouped.set(k, { target: { datasetId: targetDs, column: targetCol }, sources: [] });
    if (sourceDs && sourceCol) grouped.get(k)!.sources.push({ datasetId: sourceDs, column: sourceCol });
  }
  let seq = master.tableConnections.length;
  for (const g of grouped.values()) {
    const processId = `${canvasId}::${uuidv4()}`;
    processRecs.push({
      processId, canvasId, uploadId, sequence: ++seq,
      name: `${g.target.column} mapping`,
      operationType: 'COLUMN_LINEAGE',
      sourceFile: file.name,
      inputs: g.sources.map(s => s.datasetId),
      outputs: [g.target.datasetId],
    });
    columnEdges.push({
      edgeId: `${canvasId}::${uuidv4()}`,
      canvasId, uploadId,
      target: g.target,
      sources: g.sources,
      processId,
      transformationType: 'UNKNOWN',
    });
  }

  if (unresolved.size) {
    warnings.push(`Connections referenced ${unresolved.size} table(s) not in the registry (skipped): ${[...unresolved].join(', ')}.`);
  }

  // Any column referenced by a connection but not listed in its table's grid is
  // added as a stub so the lineage edge has something to attach to (mirrors the
  // JSON ingestion path).
  const referencedCols = new Map<string, Set<string>>();
  for (const ce of columnEdges) {
    const add = (dsId: string, col: string) => {
      if (!referencedCols.has(dsId)) referencedCols.set(dsId, new Set());
      referencedCols.get(dsId)!.add(col);
    };
    add(ce.target.datasetId, ce.target.column);
    for (const s of ce.sources) add(s.datasetId, s.column);
  }

  await db.transaction('rw', [db.tableNodes, db.processRecs, db.tableEdges, db.columnEdges, db.uploadRecs], async () => {
    let stubbedCols = 0;
    for (const [datasetId, cols] of referencedCols) {
      const node = await db.tableNodes.get(datasetId);
      if (!node) continue;
      const missing = [...cols].filter(c => !node.columns.some(existing => existing.name === c));
      if (!missing.length) continue;
      for (const name of missing) {
        node.columns.push({
          name, dataType: 'UNKNOWN', ordinal: node.columns.length + 1,
          origin: 'EXCEL', metadata: {}, stats: {}, lastEditedBy: 'UPLOAD',
        });
        stubbedCols++;
      }
      node.updatedAt = new Date().toISOString();
      await db.tableNodes.put(node);
    }
    if (stubbedCols) warnings.push(`Added ${stubbedCols} column(s) referenced by connections but missing from a table grid.`);

    if (processRecs.length) await db.processRecs.bulkPut(processRecs);
    if (tableEdges.length) await db.tableEdges.bulkPut(tableEdges);
    if (columnEdges.length) await db.columnEdges.bulkPut(columnEdges);

    const uploadRec: UploadRec = {
      uploadId, canvasId, kind: 'EXCEL', fileName: file.name,
      uploadedAt: new Date().toISOString(), status: 'ACTIVE',
      summary: {
        datasets: nameToDataset.size,
        tableEdges: tableEdges.length,
        columnEdges: columnEdges.length,
      },
      rawPayload: '',
    };
    await db.uploadRecs.put(uploadRec);
  });

  return { canvasId, tables: nameToDataset.size, tableEdges: tableEdges.length, columnEdges: columnEdges.length, warnings };
}
