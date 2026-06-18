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

  // Form fields
  const [dataType, setDataType] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [classification, setClassification] = useState<string>('UNASSIGNED');
  const [platform, setPlatform] = useState('');
  const [pii, setPii] = useState<boolean>(false);
  const [nullable, setNullable] = useState<boolean>(true);
  const [isPrimaryKey, setIsPrimaryKey] = useState<boolean>(false);
  const [isForeignKey, setIsForeignKey] = useState<boolean>(false);
  const [foreignKeyRef, setForeignKeyRef] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [length, setLength] = useState<string>('');
  const [precision, setPrecision] = useState<string>('');
  const [scale, setScale] = useState<string>('');
  const [allowedValues, setAllowedValues] = useState('');
  const [format, setFormat] = useState('');
  const [unit, setUnit] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  // Stats
  const [recordCount, setRecordCount] = useState<string>('');
  const [nullCount, setNullCount] = useState<string>('');
  const [distinctCount, setDistinctCount] = useState<string>('');
  const [minVal, setMinVal] = useState<string>('');
  const [maxVal, setMaxVal] = useState<string>('');
  const [meanVal, setMeanVal] = useState<string>('');
  const [stdDevVal, setStdDevVal] = useState<string>('');
  const [sampleValues, setSampleValues] = useState('');

  useEffect(() => {
    if (column) {
      setDataType(column.dataType || '');
      setBusinessName(column.metadata?.businessName || '');
      setDescription(column.metadata?.description || '');
      setClassification(column.metadata?.classification || 'UNASSIGNED');
      setPlatform(column.metadata?.platform || '');
      setPii(!!column.metadata?.pii);
      setNullable(column.metadata?.nullable ?? true);
      setIsPrimaryKey(!!column.metadata?.isPrimaryKey);
      setIsForeignKey(!!column.metadata?.isForeignKey);
      setForeignKeyRef(column.metadata?.foreignKeyRef || '');
      setDefaultValue(column.metadata?.defaultValue || '');
      setLength(column.metadata?.length !== undefined ? String(column.metadata.length) : '');
      setPrecision(column.metadata?.precision !== undefined ? String(column.metadata.precision) : '');
      setScale(column.metadata?.scale !== undefined ? String(column.metadata.scale) : '');
      setAllowedValues(column.metadata?.allowedValues || '');
      setFormat(column.metadata?.format || '');
      setUnit(column.metadata?.unit || '');
      setTags(column.metadata?.tags?.join(', ') || '');
      setNotes(column.metadata?.notes || '');

      setRecordCount(column.stats?.recordCount !== undefined ? String(column.stats.recordCount) : '');
      setNullCount(column.stats?.nullCount !== undefined ? String(column.stats.nullCount) : '');
      setDistinctCount(column.stats?.distinctCount !== undefined ? String(column.stats.distinctCount) : '');
      setMinVal(column.stats?.min !== undefined ? String(column.stats.min) : '');
      setMaxVal(column.stats?.max !== undefined ? String(column.stats.max) : '');
      setMeanVal(column.stats?.mean !== undefined ? String(column.stats.mean) : '');
      setStdDevVal(column.stats?.stdDev !== undefined ? String(column.stats.stdDev) : '');
      setSampleValues(column.stats?.sampleValues?.join(', ') || '');
    }
  }, [column]);

  const handleSave = async () => {
    if (!selectedColumn || !column) return;

    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    const parsedSampleValues = sampleValues.split(',').map(s => s.trim()).filter(Boolean);

    const updates: Partial<ColumnDef> = {
      dataType,
      metadata: {
        businessName: businessName || undefined,
        description: description || undefined,
        classification: classification === 'UNASSIGNED' ? undefined : (classification as any),
        platform: platform || undefined,
        pii: pii || undefined,
        nullable,
        isPrimaryKey,
        isForeignKey,
        foreignKeyRef: isForeignKey ? (foreignKeyRef || undefined) : undefined,
        defaultValue: defaultValue || undefined,
        length: length ? parseInt(length) : undefined,
        precision: precision ? parseInt(precision) : undefined,
        scale: scale ? parseInt(scale) : undefined,
        allowedValues: allowedValues || undefined,
        format: format || undefined,
        unit: unit || undefined,
        tags: parsedTags.length ? parsedTags : undefined,
        notes: notes || undefined,
      },
      stats: {
        recordCount: recordCount ? parseInt(recordCount) : undefined,
        nullCount: nullCount ? parseInt(nullCount) : undefined,
        distinctCount: distinctCount ? parseInt(distinctCount) : undefined,
        min: minVal || undefined,
        max: maxVal || undefined,
        mean: meanVal ? parseFloat(meanVal) : undefined,
        stdDev: stdDevVal ? parseFloat(stdDevVal) : undefined,
        sampleValues: parsedSampleValues.length ? parsedSampleValues : undefined,
      }
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
          {/* General */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999]">
              General
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] w-[120px] border-r border-[#dddddd]">Data Type</td>
            <td className="px-2 py-1">
              <Input value={dataType} onChange={e => setDataType(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Platform</td>
            <td className="px-2 py-1">
              <Input value={platform} onChange={e => setPlatform(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Business Name</td>
            <td className="px-2 py-1">
              <Input value={businessName} onChange={e => setBusinessName(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Classification</td>
            <td className="px-2 py-1">
              <Select value={classification} onValueChange={setClassification}>
                <SelectTrigger className="h-6 text-xs border-[#999999] font-mono rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNASSIGNED">UNASSIGNED</SelectItem>
                  <SelectItem value="PUBLIC">PUBLIC</SelectItem>
                  <SelectItem value="INTERNAL">INTERNAL</SelectItem>
                  <SelectItem value="CONFIDENTIAL">CONFIDENTIAL</SelectItem>
                  <SelectItem value="RESTRICTED">RESTRICTED</SelectItem>
                  <SelectItem value="PII">PII</SelectItem>
                  <SelectItem value="PHI">PHI</SelectItem>
                </SelectContent>
              </Select>
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Contains PII</td>
            <td className="px-2 py-1">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={pii} onChange={e => setPii(e.target.checked)} className="w-3 h-3" />
                <span className="text-[11px] font-mono text-[#333333]">Yes</span>
              </label>
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Description</td>
            <td className="px-2 py-1">
              <Input value={description} onChange={e => setDescription(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Tags</td>
            <td className="px-2 py-1">
              <Input value={tags} onChange={e => setTags(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="comma-separated" />
            </td>
          </tr>

          {/* Constraints */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
              Constraints
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Nullable</td>
            <td className="px-2 py-1">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={nullable} onChange={e => setNullable(e.target.checked)} className="w-3 h-3" />
                <span className="text-[11px] font-mono text-[#333333]">Can contain NULL</span>
              </label>
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Primary Key</td>
            <td className="px-2 py-1">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={isPrimaryKey} onChange={e => setIsPrimaryKey(e.target.checked)} className="w-3 h-3" />
                <span className="text-[11px] font-mono text-[#333333]">Unique identifier</span>
              </label>
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Foreign Key</td>
            <td className="px-2 py-1">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={isForeignKey} onChange={e => setIsForeignKey(e.target.checked)} className="w-3 h-3" />
                <span className="text-[11px] font-mono text-[#333333]">References table</span>
              </label>
            </td>
          </tr>
          {isForeignKey && (
            <tr className="border-b border-[#dddddd]">
              <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">FK Reference</td>
              <td className="px-2 py-1">
                <Input value={foreignKeyRef} onChange={e => setForeignKeyRef(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="SYSTEM:DB.SCHEMA.TABLE.COLUMN" />
              </td>
            </tr>
          )}

          {/* Type Modifiers */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
              Type Modifiers
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Length</td>
            <td className="px-2 py-1">
              <Input type="number" value={length} onChange={e => setLength(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Precision</td>
            <td className="px-2 py-1">
              <Input type="number" value={precision} onChange={e => setPrecision(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Scale</td>
            <td className="px-2 py-1">
              <Input type="number" value={scale} onChange={e => setScale(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Default Value</td>
            <td className="px-2 py-1">
              <Input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Allowed Values</td>
            <td className="px-2 py-1">
              <Input value={allowedValues} onChange={e => setAllowedValues(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Format</td>
            <td className="px-2 py-1">
              <Input value={format} onChange={e => setFormat(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="YYYY-MM-DD" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Unit</td>
            <td className="px-2 py-1">
              <Input value={unit} onChange={e => setUnit(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="USD, meters" />
            </td>
          </tr>

          {/* Statistics */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
              Statistics
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Record Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={recordCount} onChange={e => setRecordCount(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Null Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={nullCount} onChange={e => setNullCount(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Distinct Count</td>
            <td className="px-2 py-1">
              <Input type="number" value={distinctCount} onChange={e => setDistinctCount(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Min Value</td>
            <td className="px-2 py-1">
              <Input value={minVal} onChange={e => setMinVal(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Max Value</td>
            <td className="px-2 py-1">
              <Input value={maxVal} onChange={e => setMaxVal(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Mean</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={meanVal} onChange={e => setMeanVal(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Std Deviation</td>
            <td className="px-2 py-1">
              <Input type="number" step="any" value={stdDevVal} onChange={e => setStdDevVal(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Sample Values</td>
            <td className="px-2 py-1">
              <Input value={sampleValues} onChange={e => setSampleValues(e.target.value)} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="comma-separated" />
            </td>
          </tr>

          {/* Notes */}
          <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
            <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
              Notes
            </td>
          </tr>
          <tr className="border-b border-[#dddddd]">
            <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Comments</td>
            <td className="px-2 py-1">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full min-h-[60px] px-2 py-1 text-xs border border-[#999999] font-mono rounded-none resize-y"
                placeholder="Document logic, business rules, etc."
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
