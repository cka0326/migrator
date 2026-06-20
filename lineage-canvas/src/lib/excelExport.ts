// Writes a canvas's tables/columns/connections into the same workbook structure
// that parseExcelWorkbook (src/lib/excelService.ts) reads, so a produced file is a
// filled template — usable for offline analysis AND re-importable via "Upload Excel".

import * as XLSX from 'xlsx';
import type { TableNode, TableEdge, ColumnEdge, Project, Canvas } from '../types/models';
import { COLUMN_HEADER_KEYS, columnRow, tableMetaRows } from './excelSchema';

type Aoa = Array<Array<string | number>>;

// Excel sheet names: <=31 chars, none of []:*?/\, and unique within a workbook.
function sanitizeSheetName(raw: string, used: Set<string>): string {
  let base = (raw || 'TABLE').replace(/[[\]:*?/\\]/g, '_').slice(0, 31) || 'TABLE';
  let name = base;
  let i = 2;
  while (used.has(name.toUpperCase())) {
    const suffix = `_${i++}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toUpperCase());
  return name;
}

const systemLabel = (node: TableNode, project?: Project) =>
  node.system === 'LEGACY' ? (project?.legacySystemName || 'Legacy') : (project?.targetSystemName || 'Target');

// One workbook holds a whole canvas (both systems), so a bare table name can be
// ambiguous — two tables may share a name across systems/namespaces. Qualify the
// identity used for sheet names and MASTER connections: SYSTEM_NAMESPACE_TABLE.
const qualifiedTableName = (node: TableNode) => `${node.system}_${node.namespace}_${node.name}`;

/**
 * Build a workbook for one canvas: a MASTER registry + connections sheet, plus one
 * sheet per table. Returns the workbook (caller serializes / zips it).
 */
export function buildCanvasWorkbook(
  canvas: Canvas,
  nodes: TableNode[],
  tableEdges: TableEdge[],
  columnEdges: ColumnEdge[],
  project?: Project,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const nameByDataset = new Map(nodes.map(n => [n.datasetId, qualifiedTableName(n)]));

  // ---- Per-table sheets + registry rows ----
  const usedSheetNames = new Set<string>(['MASTER', 'INSTRUCTIONS']);
  const registry: Aoa = [['sheet_name', 'table_name']];

  for (const node of nodes) {
    const tableName = qualifiedTableName(node);
    const sheetName = sanitizeSheetName(tableName, usedSheetNames);
    registry.push([sheetName, tableName]);

    const aoa: Aoa = [];
    for (const [k, v] of tableMetaRows(node)) aoa.push([k, v]);
    // Human-only system label (ignored by the importer).
    aoa.push(['system', systemLabel(node, project)]);
    aoa.push([]); // blank separator
    aoa.push([...COLUMN_HEADER_KEYS]);
    const cols = [...node.columns].sort((a, b) => a.ordinal - b.ordinal);
    for (const c of cols) aoa.push(columnRow(c));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  }

  // ---- MASTER: registry, table connections, column connections ----
  const tableConns: Aoa = [['from_table', 'to_table']];
  for (const e of tableEdges) {
    const from = nameByDataset.get(e.fromDataset);
    const to = nameByDataset.get(e.toDataset);
    if (from && to) tableConns.push([from, to]);
  }

  const colConns: Aoa = [['target_table', 'target_column', 'source_table', 'source_column']];
  for (const e of columnEdges) {
    const targetTable = nameByDataset.get(e.target.datasetId);
    if (!targetTable) continue;
    for (const s of e.sources) {
      const sourceTable = nameByDataset.get(s.datasetId);
      if (sourceTable) colConns.push([targetTable, e.target.column, sourceTable, s.column]);
    }
  }

  // Sections are stacked vertically with a blank row between them; the parser locates
  // each by its header row (sheet_name / from_table / target_table).
  const masterAoa: Aoa = [...registry, [], ...tableConns, [], ...colConns];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(masterAoa), 'MASTER');

  // Short human note. INSTRUCTIONS is a reserved (non-table) sheet.
  const instructions: Aoa = [
    [`Lineage Canvas export — canvas "${canvas.name}"`],
    [project ? `Project: ${project.name}` : ''],
    [],
    ['This workbook is a filled template. Each table is a sheet; the MASTER sheet lists'],
    ['the sheet→table registry and the table/column connections. It can be re-imported'],
    ['via "Upload Excel". The lossless re-import format is project.json in the bundle.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'INSTRUCTIONS');

  return wb;
}

/** Serialize a workbook to bytes for zipping/downloading. */
export function workbookToArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
