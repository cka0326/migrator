import * as XLSX from 'xlsx';
import type { TableMetadata, ColumnMetadata, ColumnStat } from '../types/models';
import {
  DEFAULT_NAMESPACE,
  type ParsedImportModel,
  type ParsedTable,
  type ParsedColumn,
  type ParsedColumnConnection,
} from './importModel';

// Sheets the importer never treats as a table.
const RESERVED_SHEETS = new Set(['INSTRUCTIONS', 'MASTER']);
// Table-level metadata keys on a table sheet. table_name lives in the MASTER
// registry; the system (Legacy/Target) is chosen in the app's import validation
// screen (one system per import), not on the sheet.
const TABLE_META_KEYS = new Set([
  'namespace', 'description', 'environment', 'business_domain',
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
  const tcIdx = rows.findIndex(r => str(cell(r, 0)) === 'from_table');
  const ccIdx = rows.findIndex(r => str(cell(r, 0)) === 'target_table');
  const registry = readSection(rows, 'sheet_name', tcIdx);
  const tableConnections = readSection(rows, 'from_table', ccIdx === -1 ? -1 : ccIdx);
  const columnConnections = readSection(rows, 'target_table', -1);
  return { registry, tableConnections, columnConnections };
}

function buildTableMeta(meta: Record<string, any>): Partial<TableMetadata> {
  return {
    description: str(meta['description']) || undefined,
    environment: enumVal(meta['environment']) as any,
    businessDomain: str(meta['business_domain']) || undefined,
    rowCount: num(meta['row_count']),
    columnCount: num(meta['column_count']),
    hasPrimaryKey: bool(meta['has_primary_key']),
    uniqueKeyColumns: str(meta['unique_key_columns']) || undefined,
    grainDescription: str(meta['grain_description']) || undefined,
    refreshFrequency: enumVal(meta['refresh_frequency']) as any,
  };
}

function buildColumn(row: Record<string, any>): ParsedColumn | null {
  const name = upper(row['column_name']);
  if (!name) return null;
  const metadata: Partial<ColumnMetadata> = {
    nullable: bool(row['nullable']),
    maxLength: num(row['max_length']),
    precision: num(row['precision']),
    defaultValue: str(row['default_value']) || undefined,
    columnDefinition: str(row['column_definition']) || undefined,
    columnComputationFormula: str(row['column_computation_formula']) || undefined,
  };
  const stats: Partial<ColumnStat> = {
    nullCount: num(row['null_count']),
    minValue: str(row['min_value']) || undefined,
    maxValue: str(row['max_value']) || undefined,
    uniqueCount: num(row['unique_count']),
    uniques: str(row['uniques']) || undefined,
    meanValue: num(row['mean_value']),
    stddevValue: num(row['stddev_value']),
    sumValue: num(row['sum_value']),
  };
  return { name, dataType: str(row['data_type']) || undefined, metadata, stats };
}

// ---------------------------------------------------------------------------
// Public API — parse only (writes happen via ingestParsedModel)
// ---------------------------------------------------------------------------

/**
 * Parse a template workbook into the shared import model WITHOUT writing anything.
 * The MASTER registry names which sheets become tables; the connection sections
 * declare lineage; the project section is surfaced as hints for the validation UI.
 */
export async function parseExcelWorkbook(file: File): Promise<{ model: ParsedImportModel; warnings: string[] }> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);

  const masterWs = wb.Sheets['MASTER'];
  if (!masterWs) throw new Error('Missing MASTER sheet — please use the downloaded template.');
  const master = parseMaster(XLSX.utils.sheet_to_json<Row>(masterWs, { header: 1, blankrows: true }));

  const warnings: string[] = [];
  const tables: ParsedTable[] = [];

  for (const entry of master.registry) {
    const tableName = upper(entry['table_name']);
    if (!tableName) continue;
    const sheetName = str(entry['sheet_name']);
    if (RESERVED_SHEETS.has(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Registry lists sheet "${sheetName}" for table "${tableName}", but no such sheet exists.`);

    const { meta, columns } = parseTableSheet(XLSX.utils.sheet_to_json<Row>(ws, { header: 1, blankrows: true }));
    const namespace = upper(meta['namespace']) || DEFAULT_NAMESPACE;

    // No per-table system — the import targets a single system chosen in the
    // validation screen (ParsedTable.system left undefined → uses target default).
    tables.push({
      name: tableName,
      namespace,
      columns: columns.map(buildColumn).filter((c): c is ParsedColumn => c !== null),
      metadata: buildTableMeta(meta),
    });
  }

  const tableConnections = master.tableConnections
    .map(row => ({ from: upper(row['from_table']), to: upper(row['to_table']) }))
    .filter(c => c.from && c.to);

  // Column connections grouped by target column.
  const grouped = new Map<string, ParsedColumnConnection>();
  for (const row of master.columnConnections) {
    const targetTable = upper(row['target_table']);
    const targetCol = upper(row['target_column']);
    const sourceTable = upper(row['source_table']);
    const sourceCol = upper(row['source_column']);
    if (!targetTable || !targetCol) continue;
    const k = `${targetTable}::${targetCol}`;
    if (!grouped.has(k)) grouped.set(k, { target: { table: targetTable, column: targetCol }, sources: [] });
    if (sourceTable && sourceCol) grouped.get(k)!.sources.push({ table: sourceTable, column: sourceCol });
  }
  const columnConnections = [...grouped.values()].filter(c => c.sources.length > 0);

  if (tables.length === 0) {
    warnings.push('No tables found. Add a table_name in the MASTER registry for each sheet you want to ingest.');
  }

  const model: ParsedImportModel = {
    source: 'EXCEL',
    tables,
    tableConnections,
    columnConnections,
  };

  return { model, warnings };
}
