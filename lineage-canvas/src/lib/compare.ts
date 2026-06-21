import type { ColumnDef, TableNode } from '../types/models';
import { dataTypesEquivalent } from './dataTypes';

export type DiffStatus = 'same' | 'changed' | 'added' | 'removed';

export interface FieldDiff {
  field: string;        // human label
  a?: string;           // value on side A (left table)
  b?: string;           // value on side B (right table)
  changed: boolean;
}

export interface ColumnDiff {
  name: string;
  status: DiffStatus;   // added = only on B, removed = only on A
  fields: FieldDiff[];  // populated when the column exists on both sides
}

export interface TableDiff {
  columns: ColumnDiff[];
  summary: { added: number; removed: number; changed: number; same: number };
}

// The column-level fields we surface in the comparison, in display order.
// `eq`, when present, decides equivalence instead of a raw string compare — used
// so that data types that mean the same thing across systems (Snowflake / SAS /
// PySpark / Pandas) aren't flagged as changed just because they're spelled
// differently. See ./dataTypes.
const FIELD_DEFS: { label: string; get: (c: ColumnDef) => unknown; eq?: (a: unknown, b: unknown) => boolean }[] = [
  { label: 'Data Type', get: c => c.dataType, eq: (a, b) => dataTypesEquivalent(a as string, b as string) },
  { label: 'Nullable', get: c => c.metadata?.nullable },
  { label: 'Max Length', get: c => c.metadata?.maxLength },
  { label: 'Precision', get: c => c.metadata?.precision },
  { label: 'Default Value', get: c => c.metadata?.defaultValue },
  { label: 'Column Definition', get: c => c.metadata?.columnDefinition },
  { label: 'Computation Formula', get: c => c.metadata?.columnComputationFormula },
  { label: 'Null Count', get: c => c.stats?.nullCount },
  { label: 'Min Value', get: c => c.stats?.minValue },
  { label: 'Max Value', get: c => c.stats?.maxValue },
  { label: 'Unique Count', get: c => c.stats?.uniqueCount },
  { label: 'Uniques', get: c => c.stats?.uniques },
  { label: 'Mean', get: c => c.stats?.meanValue },
  { label: 'Std Dev', get: c => c.stats?.stddevValue },
  { label: 'Sum', get: c => c.stats?.sumValue },
];

function norm(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// All comparable field labels, in display order — used to drive the field filter.
export const COMPARABLE_FIELDS: string[] = FIELD_DEFS.map(f => f.label);

// Table-level metadata fields surfaced in the table comparison, in display order.
const TABLE_FIELD_DEFS: { label: string; get: (t: TableNode) => unknown }[] = [
  { label: 'Description', get: t => t.metadata?.description },
  { label: 'Environment', get: t => t.metadata?.environment },
  { label: 'Business Domain', get: t => t.metadata?.businessDomain },
  { label: 'Row Count', get: t => t.metadata?.rowCount },
  { label: 'Column Count', get: t => t.metadata?.columnCount },
  { label: 'Has Primary Key', get: t => t.metadata?.hasPrimaryKey },
  { label: 'Unique Key Columns', get: t => t.metadata?.uniqueKeyColumns },
  { label: 'Grain', get: t => t.metadata?.grainDescription },
  { label: 'Refresh Frequency', get: t => t.metadata?.refreshFrequency },
];

/**
 * Compare the table-level metadata of two tables, field by field. Returns one
 * FieldDiff per metadata field (in display order); either side may be null.
 */
export function compareTableMetadata(a: TableNode | null, b: TableNode | null): FieldDiff[] {
  if (!a || !b) return [];
  return TABLE_FIELD_DEFS.map(({ label, get }) => {
    const av = norm(get(a));
    const bv = norm(get(b));
    return { field: label, a: av, b: bv, changed: av !== bv };
  });
}

function fieldDiffs(a: ColumnDef, b: ColumnDef, included?: Set<string>): FieldDiff[] {
  return FIELD_DEFS
    .filter(({ label }) => !included || included.has(label))
    .map(({ label, get, eq }) => {
      const ra = get(a);
      const rb = get(b);
      const av = norm(ra);
      const bv = norm(rb);
      const changed = eq ? !eq(ra, rb) : av !== bv;
      return { field: label, a: av, b: bv, changed };
    });
}

/**
 * Field-by-field comparison of two individual columns. Used for the manual
 * column-pairing mode where the two columns may have different names but
 * represent the same data. Either side may be null (column not found).
 * `included`, when provided, restricts which metadata fields are compared.
 */
export function compareColumnPair(a: ColumnDef | null, b: ColumnDef | null, included?: Set<string>): FieldDiff[] {
  if (!a || !b) return [];
  return fieldDiffs(a, b, included);
}

/**
 * Compare two tables column-by-column. Columns are matched by name
 * (case-insensitive). Side A is the left/"from" table, side B is the right/"to".
 */
export function compareTables(a: TableNode | null, b: TableNode | null, included?: Set<string>): TableDiff {
  const aCols = a?.columns ?? [];
  const bCols = b?.columns ?? [];
  const aByName = new Map(aCols.map(c => [c.name.toUpperCase(), c]));
  const bByName = new Map(bCols.map(c => [c.name.toUpperCase(), c]));

  const names: string[] = [];
  const seen = new Set<string>();
  for (const c of aCols) { const k = c.name.toUpperCase(); if (!seen.has(k)) { seen.add(k); names.push(k); } }
  for (const c of bCols) { const k = c.name.toUpperCase(); if (!seen.has(k)) { seen.add(k); names.push(k); } }
  names.sort();

  const columns: ColumnDiff[] = [];
  const summary = { added: 0, removed: 0, changed: 0, same: 0 };

  for (const name of names) {
    const ac = aByName.get(name);
    const bc = bByName.get(name);

    if (ac && bc) {
      const fields = fieldDiffs(ac, bc, included);
      const changed = fields.some(f => f.changed);
      columns.push({ name: ac.name, status: changed ? 'changed' : 'same', fields });
      if (changed) summary.changed++; else summary.same++;
    } else if (ac && !bc) {
      columns.push({ name: ac.name, status: 'removed', fields: [] });
      summary.removed++;
    } else if (!ac && bc) {
      columns.push({ name: bc.name, status: 'added', fields: [] });
      summary.added++;
    }
  }

  return { columns, summary };
}
