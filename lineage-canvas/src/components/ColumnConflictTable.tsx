import type { ColumnDef } from '../types/models';
import { COLUMN_FIELDS, columnFieldToStr } from '../lib/columnMerge';

interface Props {
  columns: ColumnDef[];
  result: Record<string, string>;
  onChange: (key: string, value: string) => void;
  nameError?: string | null;
}

/**
 * Field-by-field resolver: rows are column fields, one column per source variant
 * (click to use that value), plus an editable Result. Shared by the column-merge
 * dialog and the table-merge dialog's per-column conflict resolution.
 */
export function ColumnConflictTable({ columns, result, onChange, nameError }: Props) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="bg-muted/60 border-b">
        <tr>
          <th className="text-left px-2 py-1.5 font-semibold w-[120px]">Field</th>
          {columns.map((c, i) => <th key={i} className="text-left px-2 py-1.5 font-mono font-semibold">{c.name}</th>)}
          <th className="text-left px-2 py-1.5 font-semibold w-[180px]">Result</th>
        </tr>
      </thead>
      <tbody>
        {COLUMN_FIELDS.map(f => (
          <tr key={f.key} className="border-b last:border-0 align-top">
            <td className="px-2 py-1 text-slate-500">{f.label}</td>
            {columns.map((c, i) => {
              const v = columnFieldToStr(f, c);
              return (
                <td key={i} className="px-1 py-1">
                  <button
                    onClick={() => onChange(f.key, v)}
                    title="Use this value"
                    className="w-full text-left px-1.5 py-0.5 rounded font-mono hover:bg-accent hover:text-accent-foreground border border-transparent hover:border-border"
                  >
                    {v || <span className="text-slate-300">—</span>}
                  </button>
                </td>
              );
            })}
            <td className="px-1 py-1">
              <input
                value={result[f.key] ?? ''}
                onChange={e => onChange(f.key, e.target.value)}
                className={`w-full h-7 px-1.5 text-xs font-mono rounded border bg-background ${f.key === 'name' && nameError ? 'border-destructive' : 'border-input'}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
