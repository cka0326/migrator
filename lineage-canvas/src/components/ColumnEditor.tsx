import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ArrowLeft } from 'lucide-react';
import type { ColumnDef } from '../types/models';

interface ColumnEditorProps {
  column: ColumnDef;
  datasetId: string;
  onBack: () => void;
}

export function ColumnEditor({ column, datasetId, onBack }: ColumnEditorProps) {
  const updateColumn = useStore(state => state.updateColumn);

  // Form fields
  const [dataType, setDataType] = useState(column.dataType || '');
  
  // Metadata
  const [businessName, setBusinessName] = useState(column.metadata?.businessName || '');
  const [description, setDescription] = useState(column.metadata?.description || '');
  const [classification, setClassification] = useState<string>(column.metadata?.classification || 'UNASSIGNED');
  const [platform, setPlatform] = useState(column.metadata?.platform || '');
  const [pii, setPii] = useState<boolean>(!!column.metadata?.pii);
  const [nullable, setNullable] = useState<boolean>(column.metadata?.nullable ?? true);
  const [isPrimaryKey, setIsPrimaryKey] = useState<boolean>(!!column.metadata?.isPrimaryKey);
  const [isForeignKey, setIsForeignKey] = useState<boolean>(!!column.metadata?.isForeignKey);
  const [foreignKeyRef, setForeignKeyRef] = useState(column.metadata?.foreignKeyRef || '');
  const [defaultValue, setDefaultValue] = useState(column.metadata?.defaultValue || '');
  const [length, setLength] = useState<string>(column.metadata?.length !== undefined ? String(column.metadata.length) : '');
  const [precision, setPrecision] = useState<string>(column.metadata?.precision !== undefined ? String(column.metadata.precision) : '');
  const [scale, setScale] = useState<string>(column.metadata?.scale !== undefined ? String(column.metadata.scale) : '');
  const [allowedValues, setAllowedValues] = useState(column.metadata?.allowedValues || '');
  const [format, setFormat] = useState(column.metadata?.format || '');
  const [unit, setUnit] = useState(column.metadata?.unit || '');
  const [tags, setTags] = useState(column.metadata?.tags?.join(', ') || '');
  const [notes, setNotes] = useState(column.metadata?.notes || '');

  // Stats
  const [recordCount, setRecordCount] = useState<string>(column.stats?.recordCount !== undefined ? String(column.stats.recordCount) : '');
  const [nullCount, setNullCount] = useState<string>(column.stats?.nullCount !== undefined ? String(column.stats.nullCount) : '');
  const [distinctCount, setDistinctCount] = useState<string>(column.stats?.distinctCount !== undefined ? String(column.stats.distinctCount) : '');
  const [minVal, setMinVal] = useState<string>(column.stats?.min !== undefined ? String(column.stats.min) : '');
  const [maxVal, setMaxVal] = useState<string>(column.stats?.max !== undefined ? String(column.stats.max) : '');
  const [meanVal, setMeanVal] = useState<string>(column.stats?.mean !== undefined ? String(column.stats.mean) : '');
  const [stdDevVal, setStdDevVal] = useState<string>(column.stats?.stdDev !== undefined ? String(column.stats.stdDev) : '');
  const [sampleValues, setSampleValues] = useState(column.stats?.sampleValues?.join(', ') || '');

  const handleSave = async () => {
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

    await updateColumn(datasetId, column.name, updates);
    onBack();
  };

  return (
    <div className="space-y-3 pt-2 pb-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 flex items-center gap-1 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors text-sm"
          onClick={onBack}
        >
          <ArrowLeft size={14} />
          <span className="font-medium">Back to Columns</span>
        </Button>
        <Badge variant="outline" className="text-[10px] uppercase font-semibold text-blue-600 bg-blue-50 border-blue-200 px-2 py-0.5">
          {column.origin}
        </Badge>
      </div>

      {/* Column Name Display */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 rounded-lg p-3 shadow-sm">
        <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Column Name</Label>
        <div className="font-mono text-base font-bold text-slate-900">{column.name}</div>
      </div>

      {/* Group 1: General Metadata */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide border-l-3 border-blue-500 pl-2 -ml-1">
          General Metadata
        </h4>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataType" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Data Type
            </Label>
            <Input
              id="dataType"
              value={dataType}
              onChange={e => setDataType(e.target.value)}
              placeholder="e.g. VARCHAR, INTEGER"
              className="bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-8 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="platform" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Platform
            </Label>
            <Input
              id="platform"
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              placeholder="e.g. Snowflake, Redshift"
              className="bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="businessName" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Business Name
          </Label>
          <Input
            id="businessName"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            placeholder="Friendly business definition"
            className="bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-8 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="classification" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Classification
            </Label>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger id="classification" className="w-full bg-slate-50 border-slate-300 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                <SelectItem value="PUBLIC">Public</SelectItem>
                <SelectItem value="INTERNAL">Internal</SelectItem>
                <SelectItem value="CONFIDENTIAL">Confidential</SelectItem>
                <SelectItem value="RESTRICTED">Restricted</SelectItem>
                <SelectItem value="PII">PII (Personal Identity)</SelectItem>
                <SelectItem value="PHI">PHI (Health Info)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 justify-end">
            <label className="flex items-center gap-2 h-8 px-2.5 bg-slate-50 border border-slate-300 rounded-md text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={pii}
                onChange={e => setPii(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs">Contains PII</span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Description
          </Label>
          <Input
            id="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Functional details..."
            className="bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-8 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tags" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Tags
          </Label>
          <Input
            id="tags"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="e.g. key, lookup, finance (comma-separated)"
            className="bg-slate-50 border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-8 text-sm"
          />
        </div>
      </div>

      {/* Group 2: Key & Constraint Info */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide border-l-3 border-emerald-500 pl-2 -ml-1">
          Key & Constraint Info
        </h4>

        <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
            <input
              type="checkbox"
              checked={nullable}
              onChange={e => setNullable(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
            />
            <span>Nullable <span className="text-[11px] text-slate-500 font-normal">(NULL values)</span></span>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
            <input
              type="checkbox"
              checked={isPrimaryKey}
              onChange={e => setIsPrimaryKey(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
            />
            <span>Primary Key <span className="text-[11px] text-slate-500 font-normal">(Unique ID)</span></span>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none hover:text-slate-900 transition-colors">
            <input
              type="checkbox"
              checked={isForeignKey}
              onChange={e => setIsForeignKey(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
            />
            <span>Foreign Key <span className="text-[11px] text-slate-500 font-normal">(References table)</span></span>
          </label>
        </div>

        {isForeignKey && (
          <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <Label htmlFor="foreignKeyRef" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Foreign Key Reference
            </Label>
            <Input
              id="foreignKeyRef"
              value={foreignKeyRef}
              onChange={e => setForeignKeyRef(e.target.value)}
              placeholder="e.g. SNOWFLAKE:DB.SCHEMA.TABLE.COLUMN"
              className="bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-amber-500 h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* Group 3: Type Modifiers & Format */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide border-l-3 border-purple-500 pl-2 -ml-1">
          Type Modifiers & Formats
        </h4>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="length" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Length
            </Label>
            <Input
              id="length"
              type="number"
              value={length}
              onChange={e => setLength(e.target.value)}
              placeholder="50"
              className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precision" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Precision
            </Label>
            <Input
              id="precision"
              type="number"
              value={precision}
              onChange={e => setPrecision(e.target.value)}
              placeholder="10"
              className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scale" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Scale
            </Label>
            <Input
              id="scale"
              type="number"
              value={scale}
              onChange={e => setScale(e.target.value)}
              placeholder="2"
              className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultValue" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Default Value
          </Label>
          <Input
            id="defaultValue"
            value={defaultValue}
            onChange={e => setDefaultValue(e.target.value)}
            placeholder="e.g. 'ACTIVE', NULL"
            className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="allowedValues" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Allowed Values
          </Label>
          <Input
            id="allowedValues"
            value={allowedValues}
            onChange={e => setAllowedValues(e.target.value)}
            placeholder="e.g. A, B, C or domain list"
            className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="format" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Format
            </Label>
            <Input
              id="format"
              value={format}
              onChange={e => setFormat(e.target.value)}
              placeholder="e.g. YYYY-MM-DD"
              className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Unit
            </Label>
            <Input
              id="unit"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="e.g. USD, meters"
              className="bg-slate-50 border-slate-300 focus:border-purple-500 focus:ring-purple-500 h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Group 4: Data Profile & Stats */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide border-l-3 border-cyan-500 pl-2 -ml-1">
          Data Profile & Statistics
        </h4>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recordCount" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Record Count
            </Label>
            <Input
              id="recordCount"
              type="number"
              value={recordCount}
              onChange={e => setRecordCount(e.target.value)}
              placeholder="0"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nullCount" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Null Count
            </Label>
            <Input
              id="nullCount"
              type="number"
              value={nullCount}
              onChange={e => setNullCount(e.target.value)}
              placeholder="0"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="distinctCount" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Distinct Count
            </Label>
            <Input
              id="distinctCount"
              type="number"
              value={distinctCount}
              onChange={e => setDistinctCount(e.target.value)}
              placeholder="0"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minVal" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Min Value
            </Label>
            <Input
              id="minVal"
              value={minVal}
              onChange={e => setMinVal(e.target.value)}
              placeholder="Minimum"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxVal" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Max Value
            </Label>
            <Input
              id="maxVal"
              value={maxVal}
              onChange={e => setMaxVal(e.target.value)}
              placeholder="Maximum"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meanVal" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Mean
            </Label>
            <Input
              id="meanVal"
              type="number"
              step="any"
              value={meanVal}
              onChange={e => setMeanVal(e.target.value)}
              placeholder="Average"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stdDevVal" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Std Deviation
            </Label>
            <Input
              id="stdDevVal"
              type="number"
              step="any"
              value={stdDevVal}
              onChange={e => setStdDevVal(e.target.value)}
              placeholder="Spread"
              className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sampleValues" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Sample Values
          </Label>
          <Input
            id="sampleValues"
            value={sampleValues}
            onChange={e => setSampleValues(e.target.value)}
            placeholder="e.g. active, pending, suspended (comma-separated)"
            className="bg-slate-50 border-slate-300 focus:border-cyan-500 focus:ring-cyan-500 h-8 text-sm"
          />
        </div>
      </div>

      {/* Group 5: Notes */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide border-l-3 border-amber-500 pl-2 -ml-1">
          Developer Notes
        </h4>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes" className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
            Notes & Comments
          </Label>
          <textarea
            id="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Document logic steps, validation tasks, business rules, etc."
            className="flex min-h-[70px] w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <Button
          variant="outline"
          className="flex-1 h-9 border-slate-300 hover:bg-slate-50 font-medium text-sm"
          onClick={onBack}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 h-9 bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md transition-all font-semibold text-sm"
          onClick={handleSave}
        >
          Save Column
        </Button>
      </div>
    </div>
  );
}
