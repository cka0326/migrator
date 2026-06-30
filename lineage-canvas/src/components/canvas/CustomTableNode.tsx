import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { useState, useMemo, useRef, useEffect } from 'react';

import { Badge } from '../ui/badge';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { prioritizeColumns, COLUMN_PREVIEW_LIMIT } from '../../lib/columnPreview';

export function CustomTableNode({ data, id, selected }: NodeProps<any>) {
  const selectNode = useStore(state => state.selectNode);
  const toggleNodeCollapse = useStore(state => state.toggleNodeCollapse);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);

  // Column-lineage focus mode.
  const columnFocus = useStore(state => state.columnFocus);
  const tracedColumns = useStore(state => state.tracedColumns);
  const focusColumn = useStore(state => state.focusColumn);

  const { name, namespace, system, origin, columns, metadata, collapsed } = data as any;
  const connectedColumns = useMemo(() => new Set<string>((data as any).connectedColumns ?? []), [data]);
  // A clicked connector expands both of its tables to show every column.
  const lineageHighlight = !!(data as any).lineageHighlight;
  // Expanded via "+N more" or a table double-click. The canvas owns this state
  // (so hidden-column edges can re-anchor) and pushes it back down as a flag.
  const forceExpanded = !!(data as any).forceExpanded;
  const onToggleColumns = (data as any).onToggleColumns as ((id: string, expanded: boolean) => void) | undefined;

  const systemLabel = system === 'LEGACY'
    ? (project?.legacySystemName || 'Legacy')
    : (project?.targetSystemName || 'Target');

  const [searchQuery, setSearchQuery] = useState('');
  // A double-click (expand) also fires two single clicks; defer opening the
  // details panel so a double-click can cancel it before it runs.
  const clickTimer = useRef<number | null>(null);
  useEffect(() => () => { if (clickTimer.current) window.clearTimeout(clickTimer.current); }, []);

  // Filter columns based on search query
  const filteredColumns = searchQuery.trim()
    ? columns.filter((col: any) =>
        col.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : columns;

  // Connected columns float to the top so they survive the preview cut; the rest
  // are alphabetical (see prioritizeColumns).
  const sortedColumns = prioritizeColumns(filteredColumns || [], connectedColumns);
  const isSearching = searchQuery.trim() !== '';
  // Show a compact preview of the first few columns; expand on demand ("+N more"
  // / double-click), while filtering, or when a clicked connector expanded it.
  const showAllColumns = forceExpanded || isSearching || lineageHighlight;
  const visibleColumns = showAllColumns ? sortedColumns : sortedColumns.slice(0, COLUMN_PREVIEW_LIMIT);
  const hiddenColumnCount = sortedColumns.length - visibleColumns.length;

  // ----- Focus-mode derivations -----
  const isFocusMode = !!columnFocus;
  const isFocusOrigin = isFocusMode && columnFocus!.datasetId === id;
  const tracedHere = tracedColumns[id];
  const isInTrace = isFocusMode && Array.isArray(tracedHere) && tracedHere.length > 0;
  const tracedSet = isInTrace ? new Set(tracedHere) : null;

  // In focus mode each participating node shows only its traced columns (search /
  // preview limit are bypassed); nodes outside the lineage show no columns.
  const allSorted = [...(columns || [])].sort((a: any, b: any) => a.name.localeCompare(b.name));
  const bodyColumns = isFocusMode
    ? (tracedSet ? allSorted.filter((c: any) => tracedSet.has(c.name)) : [])
    : visibleColumns;

  const showSearch = !isFocusMode && !collapsed && columns && columns.length > 0;
  const showBody = isFocusMode
    ? isInTrace
    : (!collapsed && columns && columns.length > 0 && filteredColumns.length > 0);

  // Node-level focus styling: highlight the origin, mark lineage participants,
  // and dim everything that isn't part of the trace.
  let focusClasses = '';
  if (isFocusMode) {
    if (isFocusOrigin) focusClasses = 'ring-2 ring-blue-500 border-blue-400';
    else if (isInTrace) focusClasses = 'ring-1 ring-blue-300 border-blue-300';
    else focusClasses = 'opacity-40';
  }

  // Selection styling (outside focus mode): make multi-selected tables — e.g. the
  // ones queued for a merge — clearly stand out from unselected cards.
  const selectedClasses = !isFocusMode && selected ? 'ring-2 ring-primary border-primary shadow-md' : '';

  // Connector-lineage highlight: a table that belongs to a clicked connector's
  // lineage gets a blue ring (dimming of the rest is handled via node style).
  const lineageClasses = lineageHighlight ? 'ring-2 ring-blue-500 border-blue-400 shadow-md' : '';

  return (
    <div
      className={`bg-card border-2 rounded-lg shadow-sm w-[280px] text-left overflow-visible transition-shadow duration-150 hover:shadow-md ${origin === 'STUB' ? 'border-dashed border-orange-300' : 'border-slate-300'} ${focusClasses} ${selectedClasses} ${lineageClasses}`}
    >
      {/* Table-level Handles */}
      <Handle type="target" position={Position.Left} id="table-target" className="w-3 h-3 bg-slate-400 cursor-crosshair" />
      <Handle type="source" position={Position.Right} id="table-source" className="w-3 h-3 bg-slate-400 cursor-crosshair" />

      {/* Header — a plain click opens the details panel; a modified click
          (Ctrl/Cmd/Shift) is a multi-select gesture for React Flow, so we leave
          it to add the node to the selection without opening the panel. */}
      <div
        className="p-2 border-b bg-muted/50 rounded-t-md cursor-pointer flex flex-col gap-1"
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) return;
          if (clickTimer.current) window.clearTimeout(clickTimer.current);
          clickTimer.current = window.setTimeout(() => { selectNode(id); clickTimer.current = null; }, 200);
        }}
        onDoubleClick={() => { if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; } }}
      >
        <div className="flex justify-between items-start">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-muted-foreground">{namespace}</span>
            <span className="font-semibold text-sm leading-tight break-all">{name}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {columns.length} {columns.length === 1 ? 'column' : 'columns'}
              {metadata?.rowCount != null && ` · ${Number(metadata.rowCount).toLocaleString()} rows`}
            </span>
          </div>
          <Badge variant={system === 'LEGACY' ? 'default' : 'secondary'} className="text-[10px] px-1 py-0">{systemLabel}</Badge>
        </div>

        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-1 flex-wrap">
            {metadata?.environment && <Badge variant="outline" className="text-[9px] px-1 py-0">{metadata.environment}</Badge>}
            {metadata?.businessDomain && <Badge variant="outline" className="text-[9px] px-1 py-0">{metadata.businessDomain}</Badge>}
            {origin === 'STUB' && <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-orange-100 text-orange-800 border-orange-200">Metadata Pending</Badge>}
          </div>
          <button onClick={(e) => { e.stopPropagation(); toggleNodeCollapse(id); }} className="text-muted-foreground hover:text-foreground">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Search Bar - hidden while tracing column lineage */}
      {showSearch && (
        <div className="relative border-b bg-background" onClick={(e) => e.stopPropagation()}>
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Filter columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Columns. Clicking a column traces its lineage across the whole graph. */}
      {showBody && (
        <div className="flex flex-col text-xs font-mono bg-background rounded-b-md">
          {/* Scroll region holds only the rows. `nowheel` stops React Flow from
              hijacking the wheel for canvas zoom so the list scrolls normally. */}
          <div className={bodyColumns.length > 6 ? 'flex flex-col max-h-[240px] overflow-y-auto nowheel' : 'flex flex-col'}>
            {bodyColumns.map((col: any) => {
              const isFocusedCol = columnFocus?.datasetId === id && columnFocus?.column === col.name;
              return (
                <div
                  key={col.name}
                  onClick={(e) => { e.stopPropagation(); focusColumn(id, col.name); }}
                  title="Click to trace this column's lineage"
                  className={`relative flex justify-between items-center py-1.5 px-2 border-b last:border-0 group cursor-pointer hover:bg-muted/50 ${isFocusedCol ? 'bg-blue-100 hover:bg-blue-100' : ''}`}
                >
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`col-${col.name}-target`}
                    className="w-2.5 h-2.5 -ml-[6px] bg-slate-400 border border-slate-500 rounded-full opacity-60 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair pointer-events-auto"
                  />
                  <span className={`truncate mr-2 flex-1 ${isFocusedCol ? 'font-bold text-blue-700' : ''}`}>{col.name}</span>
                  <span className="text-[10px] text-muted-foreground">{col.dataType}</span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`col-${col.name}-source`}
                    className="w-2.5 h-2.5 -mr-[6px] bg-slate-400 border border-slate-500 rounded-full opacity-60 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair pointer-events-auto"
                  />
                </div>
              );
            })}
          </div>
          {/* Toggle pinned below the scroll region so it stays visible. */}
          {!isFocusMode && !showAllColumns && hiddenColumnCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleColumns?.(id, true); }}
              className="py-1.5 px-2 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground border-t text-center rounded-b-md"
            >
              +{hiddenColumnCount} more {hiddenColumnCount === 1 ? 'column' : 'columns'}
            </button>
          )}
          {!isFocusMode && forceExpanded && !isSearching && sortedColumns.length > COLUMN_PREVIEW_LIMIT && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleColumns?.(id, false); }}
              className="py-1.5 px-2 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground border-t text-center rounded-b-md"
            >
              Show less
            </button>
          )}
        </div>
      )}
      {!isFocusMode && !collapsed && columns.length === 0 && (
        <div className="p-2 text-xs text-center text-muted-foreground italic rounded-b-md bg-background">No columns</div>
      )}
      {!isFocusMode && !collapsed && columns.length > 0 && filteredColumns.length === 0 && (
        <div className="p-2 text-xs text-center text-muted-foreground italic rounded-b-md bg-background">No columns match "{searchQuery}"</div>
      )}
    </div>
  );
}
