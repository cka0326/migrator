import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X } from 'lucide-react';
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
  };

  const handleClose = () => {
    selectColumn(null, null);
  };

  if (!selectedColumn || !column) return null;

  return (
    <div className="fixed top-0 right-[50vw] h-screen w-[35vw] bg-[#f5f5f5] border-l-2 border-[#cccccc] flex flex-col z-20 overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#e8e8e8] to-[#d0d0d0] border-b-2 border-[#999999] px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-sm font-bold text-[#333333]">{column.name}</span>
          <Button
            onClick={handleClose}
            className="h-5 w-5 p-0 bg-transparent hover:bg-[#cccccc] text-[#666666] hover:text-[#333333] border-0 rounded-none"
          >
            <X size={14} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#666666]">Column Metadata</span>
          <Button onClick={handleSave} className="ml-auto h-6 px-3 bg-gradient-to-b from-[#5b9dd9] to-[#306b9c] hover:from-[#6aadea] hover:to-[#407cb0] text-white font-mono text-[10px] rounded-none border border-[#234567]">
            Save
          </Button>
        </div>
      </div>

      {/* Content */}
      <table className="w-full border-collapse text-xs">
        <tbody>
          {/* Identity */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999]">
              Identity
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] w-[130px] border-r border-[#dddddd]">Namespace</td>
            <td className="px-2 py-1 font-mono text-[11px] text-[#333333]">{node?.namespace}</td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Table Name</td>
            <td className="px-2 py-1 font-mono text-[11px] text-[#333333]">{node?.name}</td>
          </tr>

          {/* General */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
              General
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Data Type</td>
            <td className="px-2 py-1">
              <Input value={dataType} onChange={e => setDataType(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Nullable</td>
            <td className="px-2 py-1">
              <Select value={nullable} onValueChange={setNullable}>
                <SelectTrigger className="h-6 text-xs border-[#999999] font-mono rounded-none">
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
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Max Length</td>
            <td className="px-2 py-1">
              <Input type="number" value={maxLength} onChange={e => setMaxLength(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Precision</td>
            <td className="px-2 py-1">
              <Input type="number" value={precision} onChange={e => setPrecision(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Default Value</td>
            <td className="px-2 py-1">
              <Input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Definition</td>
            <td className="px-2 py-1">
              <textarea
                value={columnDefinition}
                onChange={e => setColumnDefinition(e.target.value)}
                className="w-full min-h-[44px] px-2 py-1 text-xs border border-[#999999] font-mono rounded-none resize-y"
                placeholder="Definition of the column"
              />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Computation Formula</td>
            <td className="px-2 py-1">
              <textarea
                value={columnComputationFormula}
                onChange={e => setColumnComputationFormula(e.target.value)}
                className="w-full min-h-[44px] px-2 py-1 text-xs border border-[#999999] font-mono rounded-none resize-y"
                placeholder="Formula for computing the column"
              />
            </td>
          </tr>

          {/* Statistics */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
              Statistics
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Null Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={nullCount} onChange={e => setNullCount(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Min Value</td>
            <td className="px-2 py-1">
              <Input value={minValue} onChange={e => setMinValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Max Value</td>
            <td className="px-2 py-1">
              <Input value={maxValue} onChange={e => setMaxValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Unique Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={uniqueCount} onChange={e => setUniqueCount(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Uniques</td>
            <td className="px-2 py-1">
              <Input value={uniques} onChange={e => setUniques(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="comma-separated" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Mean</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={meanValue} onChange={e => setMeanValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Std Deviation</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={stddevValue} onChange={e => setStddevValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Sum</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={sumValue} onChange={e => setSumValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
