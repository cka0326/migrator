import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Search, GitMerge } from 'lucide-react';
import { MergeColumnsDialog } from './MergeColumnsDialog';
import type { ColumnDef } from '../types/models';

export function ColumnManager({ datasetId }: { datasetId: string }) {
  const node = useStore(state => state.nodes[datasetId]);
  const addColumn = useStore(state => state.addColumn);
  const removeColumn = useStore(state => state.removeColumn);
  const selectColumn = useStore(state => state.selectColumn);

  const [isAdding, setIsAdding] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('VARCHAR');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);

  const toggleSelected = (name: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  if (!node) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const column: ColumnDef = {
      name: newColName.toUpperCase(),
      dataType: newColType,
      ordinal: node.columns.length + 1,
      origin: 'MANUAL',
      metadata: {},
      stats: {},
    };

    addColumn(datasetId, column);
    setNewColName('');
    setIsAdding(false);
  };

  // Filter columns based on search query
  const filteredColumns = node.columns.filter(col =>
    col.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-between items-center pb-2 border-b">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Columns ({node.columns.length})</h3>
        <div className="flex items-center gap-1.5">
        {selected.size >= 2 && (
          <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
            <GitMerge size={13} className="mr-1" /> Merge ({selected.size})
          </Button>
        )}
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            + Add Column
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Column</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Column Name</Label>
                <Input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="e.g., ID" required />
              </div>
              <div className="space-y-2">
                <Label>Data Type</Label>
                <Input value={newColType} onChange={e => setNewColType(e.target.value)} placeholder="e.g., VARCHAR, NUMBER" required />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsAdding(false)} className="mr-2">Cancel</Button>
                <Button type="submit">Add Column</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search columns..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {filteredColumns.sort((a, b) => a.ordinal - b.ordinal).map((col) => {
          const allColumns = node.columns.sort((a, b) => a.ordinal - b.ordinal);
          const actualIndex = allColumns.findIndex(c => c.name === col.name);
          const isSearchActive = searchQuery.trim() !== '';

          return (
            <div
              key={col.name}
              className="flex justify-between items-center p-3 border border-slate-200 rounded-lg text-sm bg-card hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer group"
              onClick={() => selectColumn(datasetId, col.name)}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-primary shrink-0"
                  checked={selected.has(col.name)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelected(col.name)}
                  title="Select to merge"
                />
                <span className="font-mono font-semibold text-slate-800">{col.name}</span>
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">{col.dataType}</Badge>
                {col.metadata?.nullable === false && <Badge className="bg-slate-200 text-slate-700 border-slate-300 text-[8px] px-1 py-0 hover:bg-slate-200">NOT NULL</Badge>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={isSearchActive || actualIndex === 0} onClick={(e) => {
                  e.stopPropagation();
                  const newOrder = allColumns.map(c => c.name);
                  [newOrder[actualIndex - 1], newOrder[actualIndex]] = [newOrder[actualIndex], newOrder[actualIndex - 1]];
                  useStore.getState().reorderColumns(datasetId, newOrder);
                }}>↑</Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={isSearchActive || actualIndex === allColumns.length - 1} onClick={(e) => {
                  e.stopPropagation();
                  const newOrder = allColumns.map(c => c.name);
                  [newOrder[actualIndex], newOrder[actualIndex + 1]] = [newOrder[actualIndex + 1], newOrder[actualIndex]];
                  useStore.getState().reorderColumns(datasetId, newOrder);
                }}>↓</Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10" onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove column ${col.name}? Note: dependent column edges will also be removed.`)) {
                    removeColumn(datasetId, col.name);
                  }
                }}>✕</Button>
              </div>
            </div>
          );
        })}
        {node.columns.length === 0 && (
          <div className="text-center text-muted-foreground p-6 border border-dashed rounded-lg bg-slate-50/50">
            No columns yet.
          </div>
        )}
        {node.columns.length > 0 && filteredColumns.length === 0 && (
          <div className="text-center text-muted-foreground p-6 border border-dashed rounded-lg bg-slate-50/50">
            No columns match "{searchQuery}".
          </div>
        )}
      </div>

      <MergeColumnsDialog
        open={mergeOpen}
        onOpenChange={(o) => { setMergeOpen(o); if (!o) setSelected(new Set()); }}
        datasetId={datasetId}
        columns={node.columns.filter(c => selected.has(c.name))}
      />
    </div>
  );
}
