import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { useState } from 'react';

import { Badge } from '../ui/badge';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useStore } from '../../store/useStore';

export function CustomTableNode({ data, id }: NodeProps<any>) {
  const selectNode = useStore(state => state.selectNode);
  const toggleNodeCollapse = useStore(state => state.toggleNodeCollapse);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);

  const { name, namespace, system, origin, columns, metadata, collapsed } = data as any;

  const systemLabel = system === 'LEGACY'
    ? (project?.legacySystemName || 'Legacy')
    : (project?.targetSystemName || 'Target');

  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const COLUMN_PREVIEW_LIMIT = 5;

  // Filter columns based on search query
  const filteredColumns = searchQuery.trim()
    ? columns.filter((col: any) =>
        col.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : columns;

  const sortedColumns = [...(filteredColumns || [])].sort((a: any, b: any) => a.name.localeCompare(b.name));
  const isSearching = searchQuery.trim() !== '';
  // Show a compact preview of the first few columns; expand on demand. While the
  // user is actively filtering, always show every match.
  const showAllColumns = expanded || isSearching;
  const visibleColumns = showAllColumns ? sortedColumns : sortedColumns.slice(0, COLUMN_PREVIEW_LIMIT);
  const hiddenColumnCount = sortedColumns.length - visibleColumns.length;

  return (
    <div
      className={`bg-card border-2 rounded-md shadow-sm w-[280px] text-left overflow-visible ${origin === 'STUB' ? 'border-dashed border-orange-300' : 'border-slate-300'}`}
      onClick={() => selectNode(id)}
    >
      {/* Table-level Handles */}
      <Handle type="target" position={Position.Left} id="table-target" className="w-3 h-3 bg-slate-400 cursor-crosshair" />
      <Handle type="source" position={Position.Right} id="table-source" className="w-3 h-3 bg-slate-400 cursor-crosshair" />

      {/* Header */}
      <div className="p-2 border-b bg-muted/50 rounded-t-md cursor-pointer flex flex-col gap-1">
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

      {/* Search Bar - Only show when not collapsed and has columns */}
      {!collapsed && columns && columns.length > 0 && (
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

      {/* Columns */}
      {!collapsed && columns && columns.length > 0 && filteredColumns.length > 0 && (
        <div className={`flex flex-col text-xs font-mono bg-background rounded-b-md ${visibleColumns.length > 6 ? 'max-h-[240px] overflow-y-auto' : ''}`}>
          {visibleColumns.map((col: any) => (
            <div key={col.name} className="relative flex justify-between items-center py-1.5 px-2 border-b last:border-0 group hover:bg-muted/50">
               <Handle
                 type="target"
                 position={Position.Left}
                 id={`col-${col.name}-target`}
                 className="w-2.5 h-2.5 -ml-[6px] bg-slate-400 border border-slate-500 rounded-full opacity-60 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair pointer-events-auto"
               />
               <span className="truncate mr-2 flex-1">{col.name}</span>
               <span className="text-[10px] text-muted-foreground">{col.dataType}</span>
               <Handle
                 type="source"
                 position={Position.Right}
                 id={`col-${col.name}-source`}
                 className="w-2.5 h-2.5 -mr-[6px] bg-slate-400 border border-slate-500 rounded-full opacity-60 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair pointer-events-auto"
               />
            </div>
          ))}
          {!showAllColumns && hiddenColumnCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="py-1.5 px-2 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground border-t text-center"
            >
              +{hiddenColumnCount} more {hiddenColumnCount === 1 ? 'column' : 'columns'}
            </button>
          )}
          {expanded && !isSearching && sortedColumns.length > COLUMN_PREVIEW_LIMIT && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="py-1.5 px-2 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground border-t text-center"
            >
              Show less
            </button>
          )}
        </div>
      )}
      {!collapsed && columns.length === 0 && (
        <div className="p-2 text-xs text-center text-muted-foreground italic rounded-b-md bg-background">No columns</div>
      )}
      {!collapsed && columns.length > 0 && filteredColumns.length === 0 && (
        <div className="p-2 text-xs text-center text-muted-foreground italic rounded-b-md bg-background">No columns match "{searchQuery}"</div>
      )}
    </div>
  );
}
