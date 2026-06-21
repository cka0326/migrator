import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { dataTypesEquivalent } from '../../lib/dataTypes';
import { Wand2, Plus, Trash2, ArrowRight, AlertTriangle, Check } from 'lucide-react';
import type { TableNode, TableMapping, ColumnMappingPair } from '../../types/models';

interface Props {
  mapping: TableMapping;
  legacyNode?: TableNode;
  targetNode?: TableNode;
  legacyLabel: string;
  targetLabel: string;
}

export function ColumnMappingEditor({ mapping, legacyNode, targetNode, legacyLabel, targetLabel }: Props) {
  const updateTableMapping = useStore(s => s.updateTableMapping);
  const autoSuggestColumns = useStore(s => s.autoSuggestColumns);
  const [newLegacy, setNewLegacy] = useState<string>('');
  const [newTarget, setNewTarget] = useState<string>('');

  const legacyCols = legacyNode?.columns ?? [];
  const targetCols = targetNode?.columns ?? [];
  const colByName = (cols: typeof legacyCols, name: string) => cols.find(c => c.name.toUpperCase() === name.toUpperCase());

  const pairedLegacy = new Set(mapping.columnMappings.map(p => p.legacyColumn.toUpperCase()));
  const pairedTarget = new Set(mapping.columnMappings.map(p => p.targetColumn.toUpperCase()));
  const availLegacy = legacyCols.filter(c => !pairedLegacy.has(c.name.toUpperCase()));
  const availTarget = targetCols.filter(c => !pairedTarget.has(c.name.toUpperCase()));

  const setPairs = (pairs: ColumnMappingPair[]) => updateTableMapping(mapping.id, { columnMappings: pairs });

  const addPair = () => {
    if (!newLegacy || !newTarget) return;
    setPairs([...mapping.columnMappings, { legacyColumn: newLegacy, targetColumn: newTarget }]);
    setNewLegacy(''); setNewTarget('');
  };
  const removePair = (i: number) => setPairs(mapping.columnMappings.filter((_, idx) => idx !== i));

  return (
    <div className="px-4 py-3 bg-slate-50/70 border-t">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Column mappings</span>
        <Button size="xs" variant="outline" onClick={() => autoSuggestColumns(mapping.id)} disabled={!legacyNode || !targetNode}>
          <Wand2 className="mr-1" /> Auto-match by name
        </Button>
      </div>

      {mapping.columnMappings.length === 0 && (
        <div className="text-xs text-slate-400 py-1">No column pairs yet — auto-match or add manually below.</div>
      )}

      <div className="space-y-1">
        {mapping.columnMappings.map((p, i) => {
          const lc = colByName(legacyCols, p.legacyColumn);
          const tc = colByName(targetCols, p.targetColumn);
          const missing = !lc || !tc;
          const typeOk = !missing && dataTypesEquivalent(lc!.dataType, tc!.dataType);
          return (
            <div key={`${p.legacyColumn}->${p.targetColumn}-${i}`}
              className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-2 text-xs bg-white border rounded px-2 py-1.5">
              <span className="font-mono truncate">
                {p.legacyColumn}
                <span className="text-slate-400 ml-1">{lc ? `· ${lc.dataType}` : '· missing'}</span>
              </span>
              <ArrowRight size={12} className="text-slate-300" />
              <span className="font-mono truncate">
                {p.targetColumn}
                <span className="text-slate-400 ml-1">{tc ? `· ${tc.dataType}` : '· missing'}</span>
              </span>
              {missing ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600"><AlertTriangle size={11} /> missing</span>
              ) : typeOk ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><Check size={11} /> type ok</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600"><AlertTriangle size={11} /> type diff</span>
              )}
              <button onClick={() => removePair(i)} className="text-slate-400 hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>

      {/* Add a pair from remaining columns */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 mt-2">
        <Select value={newLegacy} onValueChange={setNewLegacy} disabled={!legacyNode}>
          <SelectTrigger className="h-7 text-xs min-w-0">
            <SelectValue placeholder={`${legacyLabel} column`}>{(v: string) => v || `${legacyLabel} column`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availLegacy.length === 0 && <SelectItem value="__none" disabled>All columns mapped</SelectItem>}
            {availLegacy.map(c => <SelectItem key={c.name} value={c.name}>{c.name} · {c.dataType}</SelectItem>)}
          </SelectContent>
        </Select>
        <ArrowRight size={12} className="text-slate-300" />
        <Select value={newTarget} onValueChange={setNewTarget} disabled={!targetNode}>
          <SelectTrigger className="h-7 text-xs min-w-0">
            <SelectValue placeholder={`${targetLabel} column`}>{(v: string) => v || `${targetLabel} column`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availTarget.length === 0 && <SelectItem value="__none" disabled>All columns mapped</SelectItem>}
            {availTarget.map(c => <SelectItem key={c.name} value={c.name}>{c.name} · {c.dataType}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="xs" onClick={addPair} disabled={!newLegacy || !newTarget}><Plus /></Button>
      </div>
    </div>
  );
}
