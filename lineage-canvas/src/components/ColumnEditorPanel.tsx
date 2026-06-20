import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Check, X } from 'lucide-react';
import type { ColumnDef } from '../types/models';

export function ColumnEditorPanel() {
  const selectedColumn = useStore(state => state.selectedColumn);
  const selectColumn = useStore(state => state.selectColumn);
  const nodes = useStore(state => state.nodes);
  const updateColumn = useStore(state => state.updateColumn);

  const node = selectedColumn ? nodes[selectedColumn.datasetId] : null;
  const column = node?.columns.find(c => c.name === selectedColumn?.columnName);

  // Metadata fields
  const [dataType, setDataType] = useState('');
  const [nullable, setNullable] = useState<string>('UNASSIGNED');
  const [maxLength, setMaxLength] = useState<string>('');
  const [precision, setPrecision] = useState<string>('');
  const [defaultValue, setDefaultValue] = useState('');
  const [columnDefinition, setColumnDefinition] = useState('');
  const [columnComputationFormula, setColumnComputationFormula] = useState('');

  // Profiling stats
  const [nullCount, setNullCount] = useState<string>('');
  const [minValue, setMinValue] = useState<string>('');
  const [maxValue, setMaxValue] = useState<string>('');
  const [uniqueCount, setUniqueCount] = useState<string>('');
  const [uniques, setUniques] = useState('');
  const [meanValue, setMeanValue] = useState<string>('');
  const [stddevValue, setStddevValue] = useState<string>('');
  const [sumValue, setSumValue] = useState<string>('');

  // Shows the "Save successful" confirmation; cleared whenever a field changes.
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (column) {
      setDataType(column.dataType || '');
      setNullable(column.metadata?.nullable === undefined ? 'UNASSIGNED' : String(column.metadata.nullable));
      setMaxLength(column.metadata?.maxLength !== undefined ? String(column.metadata.maxLength) : '');
      setPrecision(column.metadata?.precision !== undefined ? String(column.metadata.precision) : '');
      setDefaultValue(column.metadata?.defaultValue || '');
      setColumnDefinition(column.metadata?.columnDefinition || '');
      setColumnComputationFormula(column.metadata?.columnComputationFormula || '');

      setNullCount(column.stats?.nullCount !== undefined ? String(column.stats.nullCount) : '');
      setMinValue(column.stats?.minValue ?? '');
      setMaxValue(column.stats?.maxValue ?? '');
      setUniqueCount(column.stats?.uniqueCount !== undefined ? String(column.stats.uniqueCount) : '');
      setUniques(column.stats?.uniques || '');
      setMeanValue(column.stats?.meanValue !== undefined ? String(column.stats.meanValue) : '');
      setStddevValue(column.stats?.stddevValue !== undefined ? String(column.stats.stddevValue) : '');
      setSumValue(column.stats?.sumValue !== undefined ? String(column.stats.sumValue) : '');
    }
  }, [column]);

  // Clear the confirmation as soon as the user changes any field. The post-save
  // store refresh re-applies identical values, so this key is unchanged then.
  const formKey = [
    dataType, nullable, maxLength, precision, defaultValue, columnDefinition, columnComputationFormula,
    nullCount, minValue, maxValue, uniqueCount, uniques, meanValue, stddevValue, sumValue,
  ].join('');
  useEffect(() => { setSaved(false); }, [formKey]);

  const handleSave = async () => {
    if (!selectedColumn || !column) return;

    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

    const updates: Partial<ColumnDef> = {
      dataType,
      metadata: {
        nullable: nullable === 'UNASSIGNED' ? undefined : nullable === 'true',
        maxLength: num(maxLength),
        precision: num(precision),
        defaultValue: defaultValue || undefined,
        columnDefinition: columnDefinition || undefined,
        columnComputationFormula: columnComputationFormula || undefined,
      },
      stats: {
        nullCount: num(nullCount),
        minValue: minValue || undefined,
        maxValue: maxValue || undefined,
        uniqueCount: num(uniqueCount),
        uniques: uniques || undefined,
        meanValue: num(meanValue),
        stddevValue: num(stddevValue),
        sumValue: num(sumValue),
      },
    };

    await updateColumn(selectedColumn.datasetId, column.name, updates);
    setSaved(true);
  };

  const handleClose = () => {
    selectColumn(null, null);
  };

  if (!selectedColumn || !column) return null;

  return (
    <div className="fixed top-0 right-[min(50vw,640px)] h-screen w-[35vw] max-w-[480px] bg-card border-l border-border shadow-xl flex flex-col z-20 overflow-y-auto animate-emerge-left">
      {/* Header */}
      <div className="bg-muted/40 border-b border-border px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-mono text-sm font-bold text-foreground truncate min-w-0">{column.name}</span>
          <Button
            onClick={handleClose}
            className="h-5 w-5 p-0 shrink-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground border-0 rounded-md"
          >
            <X size={14} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">Column Metadata</span>
          <div className="ml-auto flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-green-700">
                <Check size={11} /> Save successful
              </span>
            )}
            <Button onClick={handleSave} className="h-6 px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-[10px] rounded-md">
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <table className="w-full border-collapse text-xs">
        <tbody>
          {/* Identity */}
          <tr className="bg-muted/60">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-border">
              Identity
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] w-[130px] border-r border-border/60">Namespace</td>
            <td className="px-2 py-1 font-mono text-[11px] text-foreground break-all">{node?.namespace}</td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Table Name</td>
            <td className="px-2 py-1 font-mono text-[11px] text-foreground break-all">{node?.name}</td>
          </tr>

          {/* General */}
          <tr className="bg-muted/60">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-border border-t border-border">
              General
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Data Type</td>
            <td className="px-2 py-1">
              <Input value={dataType} onChange={e => setDataType(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Nullable</td>
            <td className="px-2 py-1">
              <Select value={nullable} onValueChange={setNullable}>
                <SelectTrigger className="h-6 text-xs border-border font-mono rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNASSIGNED">UNASSIGNED</SelectItem>
                  <SelectItem value="true">TRUE</SelectItem>
                  <SelectItem value="false">FALSE</SelectItem>
                </SelectContent>
              </Select>
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Max Length</td>
            <td className="px-2 py-1">
              <Input type="number" value={maxLength} onChange={e => setMaxLength(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Precision</td>
            <td className="px-2 py-1">
              <Input type="number" value={precision} onChange={e => setPrecision(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Default Value</td>
            <td className="px-2 py-1">
              <Input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Definition</td>
            <td className="px-2 py-1">
              <textarea
                value={columnDefinition}
                onChange={e => setColumnDefinition(e.target.value)}
                className="w-full min-h-[44px] px-2 py-1 text-xs border border-border font-mono rounded-md resize-y"
                placeholder="Definition of the column"
              />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Computation Formula</td>
            <td className="px-2 py-1">
              <textarea
                value={columnComputationFormula}
                onChange={e => setColumnComputationFormula(e.target.value)}
                className="w-full min-h-[44px] px-2 py-1 text-xs border border-border font-mono rounded-md resize-y"
                placeholder="Formula for computing the column"
              />
            </td>
          </tr>

          {/* Statistics */}
          <tr className="bg-muted/60">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-border border-t border-border">
              Statistics
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Null Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={nullCount} onChange={e => setNullCount(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Min Value</td>
            <td className="px-2 py-1">
              <Input value={minValue} onChange={e => setMinValue(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Max Value</td>
            <td className="px-2 py-1">
              <Input value={maxValue} onChange={e => setMaxValue(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Unique Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={uniqueCount} onChange={e => setUniqueCount(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Uniques</td>
            <td className="px-2 py-1">
              <Input value={uniques} onChange={e => setUniques(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" placeholder="comma-separated" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Mean</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={meanValue} onChange={e => setMeanValue(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Std Deviation</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={stddevValue} onChange={e => setStddevValue(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Sum</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={sumValue} onChange={e => setSumValue(e.target.value)} className="h-6 text-xs border-border font-mono rounded-md" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
