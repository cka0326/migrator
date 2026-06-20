// Single source of truth for the Excel template's field names and ordering, shared
// by the parser (src/lib/excelService.ts) and the writer (src/lib/excelExport.ts)
// so a filled workbook this app produces round-trips back through import.

import type { TableNode, ColumnDef } from '../types/models';

// Table-level metadata block keys (column A of a table sheet). `namespace` lives on
// the TableNode itself, not in TableMetadata; the rest map to TableMetadata fields.
// `system` is written for human analysis only — the importer chooses one system per
// import in the validation screen and ignores this key.
export const TABLE_META_KEYS = [
  'namespace',
  'description',
  'environment',
  'business_domain',
  'row_count',
  'column_count',
  'has_primary_key',
  'unique_key_columns',
  'grain_description',
  'refresh_frequency',
] as const;

// Column-row header keys (the `column_name | data_type | ...` table on a sheet).
export const COLUMN_HEADER_KEYS = [
  'column_name',
  'data_type',
  'nullable',
  'max_length',
  'precision',
  'default_value',
  'column_definition',
  'column_computation_formula',
  'null_count',
  'min_value',
  'max_value',
  'unique_count',
  'uniques',
  'mean_value',
  'stddev_value',
  'sum_value',
] as const;

// ---------------------------------------------------------------------------
// Write-side mappers (typed model -> cell values). Empty/undefined become ''.
// ---------------------------------------------------------------------------

const cellVal = (v: unknown): string | number => {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
};

/** Table-meta block as ordered [key, value] rows for a table sheet. */
export function tableMetaRows(node: TableNode): Array<[string, string | number]> {
  const m = node.metadata || {};
  const byKey: Record<(typeof TABLE_META_KEYS)[number], unknown> = {
    namespace: node.namespace,
    description: m.description,
    environment: m.environment,
    business_domain: m.businessDomain,
    row_count: m.rowCount,
    column_count: m.columnCount,
    has_primary_key: m.hasPrimaryKey,
    unique_key_columns: m.uniqueKeyColumns,
    grain_description: m.grainDescription,
    refresh_frequency: m.refreshFrequency,
  };
  return TABLE_META_KEYS.map(k => [k, cellVal(byKey[k])]);
}

/** A single column's cell values in COLUMN_HEADER_KEYS order. */
export function columnRow(col: ColumnDef): Array<string | number> {
  const md = col.metadata || {};
  const st = col.stats || {};
  const byKey: Record<(typeof COLUMN_HEADER_KEYS)[number], unknown> = {
    column_name: col.name,
    data_type: col.dataType,
    nullable: md.nullable,
    max_length: md.maxLength,
    precision: md.precision,
    default_value: md.defaultValue,
    column_definition: md.columnDefinition,
    column_computation_formula: md.columnComputationFormula,
    null_count: st.nullCount,
    min_value: st.minValue,
    max_value: st.maxValue,
    unique_count: st.uniqueCount,
    uniques: st.uniques,
    mean_value: st.meanValue,
    stddev_value: st.stddevValue,
    sum_value: st.sumValue,
  };
  return COLUMN_HEADER_KEYS.map(k => cellVal(byKey[k]));
}
