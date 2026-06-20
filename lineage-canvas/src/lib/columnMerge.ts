import type { ColumnDef } from '../types/models';

// Shared field model for resolving column-merge conflicts (used by both the
// column-merge dialog and the per-column conflict UI inside the table-merge dialog).

export type FieldType = 'text' | 'num' | 'bool';
export interface ColumnFieldDef { key: string; label: string; type: FieldType; get: (c: ColumnDef) => unknown }

export const COLUMN_FIELDS: ColumnFieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', get: c => c.name },
  { key: 'dataType', label: 'Data Type', type: 'text', get: c => c.dataType },
  { key: 'nullable', label: 'Nullable', type: 'bool', get: c => c.metadata?.nullable },
  { key: 'maxLength', label: 'Max Length', type: 'num', get: c => c.metadata?.maxLength },
  { key: 'precision', label: 'Precision', type: 'num', get: c => c.metadata?.precision },
  { key: 'defaultValue', label: 'Default', type: 'text', get: c => c.metadata?.defaultValue },
  { key: 'columnDefinition', label: 'Definition', type: 'text', get: c => c.metadata?.columnDefinition },
  { key: 'columnComputationFormula', label: 'Formula', type: 'text', get: c => c.metadata?.columnComputationFormula },
  { key: 'nullCount', label: 'Null Count', type: 'num', get: c => c.stats?.nullCount },
  { key: 'minValue', label: 'Min', type: 'text', get: c => c.stats?.minValue },
  { key: 'maxValue', label: 'Max', type: 'text', get: c => c.stats?.maxValue },
  { key: 'uniqueCount', label: 'Unique Count', type: 'num', get: c => c.stats?.uniqueCount },
  { key: 'uniques', label: 'Uniques', type: 'text', get: c => c.stats?.uniques },
  { key: 'meanValue', label: 'Mean', type: 'num', get: c => c.stats?.meanValue },
  { key: 'stddevValue', label: 'Std Dev', type: 'num', get: c => c.stats?.stddevValue },
  { key: 'sumValue', label: 'Sum', type: 'num', get: c => c.stats?.sumValue },
];

export const columnFieldToStr = (f: ColumnFieldDef, c: ColumnDef): string => {
  const v = f.get(c);
  if (v === undefined || v === null || v === '') return '';
  if (f.type === 'bool') return v ? 'true' : 'false';
  return String(v);
};

/** Seed a result map from variants: first non-empty value per field. */
export const seedColumnResult = (columns: ColumnDef[]): Record<string, string> => {
  const r: Record<string, string> = {};
  for (const f of COLUMN_FIELDS) {
    r[f.key] = columns.map(c => columnFieldToStr(f, c)).find(v => v !== '') ?? '';
  }
  return r;
};

const parseNum = (s: string) => (s.trim() === '' ? undefined : Number(s));
const parseBool = (s: string) => { const u = s.trim().toUpperCase(); return u === 'TRUE' ? true : u === 'FALSE' ? false : undefined; };

/** Build a ColumnDef from a resolved result map. */
export function buildMergedColumn(result: Record<string, string>): ColumnDef {
  return {
    name: (result.name || '').trim().toUpperCase(),
    dataType: result.dataType.trim() || 'UNKNOWN',
    ordinal: 0,
    origin: 'MANUAL',
    metadata: {
      nullable: parseBool(result.nullable),
      maxLength: parseNum(result.maxLength),
      precision: parseNum(result.precision),
      defaultValue: result.defaultValue.trim() || undefined,
      columnDefinition: result.columnDefinition.trim() || undefined,
      columnComputationFormula: result.columnComputationFormula.trim() || undefined,
    },
    stats: {
      nullCount: parseNum(result.nullCount),
      minValue: result.minValue.trim() || undefined,
      maxValue: result.maxValue.trim() || undefined,
      uniqueCount: parseNum(result.uniqueCount),
      uniques: result.uniques.trim() || undefined,
      meanValue: parseNum(result.meanValue),
      stddevValue: parseNum(result.stddevValue),
      sumValue: parseNum(result.sumValue),
    },
    lastEditedBy: 'USER',
  };
}
