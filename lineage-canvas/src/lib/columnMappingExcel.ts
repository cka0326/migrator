// Download / upload an Excel workbook to map columns between the two tables of a
// single legacy↔target TableMapping. This is COLUMN mapping within an already
// mapped table pair — not table mapping. Mapping tables with many columns one by
// one in the UI is slow, so a user can export the pair to a spreadsheet, fill the
// target column beside each legacy column offline, and re-upload it here.
//
// A column mapping is purely a legacy-column → target-column correspondence: no
// data types or other metadata are carried. Import is additive — uploaded pairs
// are added to the existing ones; nothing is replaced or removed.

import * as XLSX from 'xlsx';
import type { TableNode, TableMapping, ColumnMappingPair } from '../types/models';

type Aoa = Array<Array<string | number>>;
type Row = any[];

const MAP_SHEET = 'Column Mapping';
const REF_SHEET = 'Target Columns (reference)';

const str = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
const cell = (r: Row | undefined, i: number) => (r ? r[i] : undefined);

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a workbook for one table mapping: an editable "Column Mapping" sheet with
 * every legacy column on its own row (pre-filled with any existing target pairing),
 * plus a reference sheet listing all target column names so the user can copy them.
 */
export function buildColumnMappingWorkbook(
  mapping: TableMapping,
  legacyNode: TableNode,
  targetNode: TableNode,
  legacyLabel: string,
  targetLabel: string,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // canonical target column name keyed by upper-cased name.
  const targetByName = new Map(targetNode.columns.map(c => [c.name.toUpperCase(), c.name]));
  // existing legacy→target pairing, keyed by upper-cased legacy column.
  const pairByLegacy = new Map(mapping.columnMappings.map(p => [p.legacyColumn.toUpperCase(), p]));

  const legacyTable = legacyNode.namespace ? `${legacyNode.namespace}.${legacyNode.name}` : legacyNode.name;
  const targetTable = targetNode.namespace ? `${targetNode.namespace}.${targetNode.name}` : targetNode.name;

  const aoa: Aoa = [
    [`Column mapping — ${legacyLabel}: ${legacyTable}  →  ${targetLabel}: ${targetTable}`],
    ['Fill the target_column beside each legacy_column, then re-upload. Leave target_column blank to leave a column unmapped.'],
    [`Valid target column names are listed on the "${REF_SHEET}" sheet.`],
    [],
    ['legacy_column', 'target_column'],
  ];

  const sortedLegacy = [...legacyNode.columns].sort((a, b) => a.ordinal - b.ordinal);
  for (const lc of sortedLegacy) {
    const pair = pairByLegacy.get(lc.name.toUpperCase());
    const targetCol = pair ? (targetByName.get(pair.targetColumn.toUpperCase()) ?? pair.targetColumn) : '';
    aoa.push([lc.name, targetCol]);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), MAP_SHEET);

  // Reference sheet: all target column names for lookup / copy-paste.
  const refAoa: Aoa = [['target_column']];
  for (const c of [...targetNode.columns].sort((a, b) => a.ordinal - b.ordinal)) {
    refAoa.push([c.name]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(refAoa), REF_SHEET);

  return wb;
}

/** Serialize a workbook to bytes for downloading. */
export function columnMappingWorkbookToBlob(wb: XLSX.WorkBook): Blob {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------------------------------------------------------------------
// Parse + validate (additive)
// ---------------------------------------------------------------------------

export interface ColumnMappingImportResult {
  newPairs: ColumnMappingPair[];   // pairs to append to mapping.columnMappings
  addedCount: number;              // === newPairs.length
  warnings: string[];              // unknown columns, already-mapped conflicts, etc.
}

/**
 * Parse an uploaded column-mapping workbook against the live tables and the current
 * mapping, returning only the *new* pairs to add. Column names are resolved to the
 * canonical spelling on the live node (casing/whitespace in the sheet don't matter).
 * Rows are dropped and surfaced as warnings when the column is unknown, or when the
 * legacy/target column is already mapped — existing pairs are never replaced.
 */
export async function parseColumnMappingWorkbook(
  file: File,
  mapping: TableMapping,
  legacyNode: TableNode,
  targetNode: TableNode,
): Promise<ColumnMappingImportResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[MAP_SHEET] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`Missing "${MAP_SHEET}" sheet — please use the downloaded template.`);

  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, blankrows: true });
  const headerIdx = rows.findIndex(r => str(cell(r, 0)).toLowerCase() === 'legacy_column');
  if (headerIdx === -1) {
    throw new Error(`Could not find the "legacy_column" header row — please use the downloaded template.`);
  }

  const legacyByName = new Map(legacyNode.columns.map(c => [c.name.toUpperCase(), c.name]));
  const targetByName = new Map(targetNode.columns.map(c => [c.name.toUpperCase(), c.name]));

  // Everything already mapped stays put; track it so we neither duplicate nor replace.
  const existByLegacy = new Map(mapping.columnMappings.map(p => [p.legacyColumn.toUpperCase(), p.targetColumn.toUpperCase()]));
  const usedLegacy = new Set(existByLegacy.keys());
  const usedTarget = new Set(mapping.columnMappings.map(p => p.targetColumn.toUpperCase()));

  const newPairs: ColumnMappingPair[] = [];
  const warnings: string[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const legacyRaw = str(cell(rows[i], 0));
    const targetRaw = str(cell(rows[i], 1));
    if (!legacyRaw || !targetRaw) continue;   // blank row / intentionally unmapped

    const legacyName = legacyByName.get(legacyRaw.toUpperCase());
    if (!legacyName) { warnings.push(`Legacy column "${legacyRaw}" is not in ${legacyNode.name} — skipped.`); continue; }
    const targetName = targetByName.get(targetRaw.toUpperCase());
    if (!targetName) { warnings.push(`Target column "${targetRaw}" is not in ${targetNode.name} — skipped.`); continue; }

    const lu = legacyName.toUpperCase();
    const tu = targetName.toUpperCase();

    // Identical to an existing pair — already mapped, nothing to do.
    if (existByLegacy.get(lu) === tu) continue;

    if (usedLegacy.has(lu)) { warnings.push(`Legacy column "${legacyName}" is already mapped — left unchanged.`); continue; }
    if (usedTarget.has(tu)) { warnings.push(`Target column "${targetName}" is already mapped — left unchanged.`); continue; }

    usedLegacy.add(lu);
    usedTarget.add(tu);
    newPairs.push({ legacyColumn: legacyName, targetColumn: targetName });
  }

  return { newPairs, addedCount: newPairs.length, warnings };
}
