import { useStore } from '../store/useStore';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import type { TableMetadata } from '../types/models';
import { ColumnManager } from './ColumnManager';

export function DetailsPanel() {
  const selectedNodeId = useStore(state => state.selectedNodeId);
  const selectNode = useStore(state => state.selectNode);
  const nodes = useStore(state => state.nodes);
  const updateTableMetadata = useStore(state => state.updateTableMetadata);
  const deleteTableNode = useStore(state => state.deleteTableNode);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);

  const node = selectedNodeId ? nodes[selectedNodeId] : null;
  const systemLabel = node
    ? (node.system === 'LEGACY' ? (project?.legacySystemName || 'Legacy') : (project?.targetSystemName || 'Target'))
    : '';

  const [meta, setMeta] = useState<TableMetadata | null>(null);
  // Shows the "Save successful" confirmation; cleared whenever a field changes.
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (node) {
      setMeta(node.metadata);
    }
  }, [node]);

  // Clear the confirmation as soon as the user edits a field. Compared by value
  // (not reference) so the post-save store refresh — which re-applies identical
  // values — doesn't dismiss it.
  const metaKey = JSON.stringify(meta);
  useEffect(() => { setSaved(false); }, [metaKey]);

  if (!node || !meta) return null;

  const handleSave = async () => {
    await updateTableMetadata(node.datasetId, meta);
    setSaved(true);
  };

  const handleClose = () => {
    selectNode(null);
  };

  if (!selectedNodeId || !node || !meta) return null;

  return (
    <div className="fixed top-0 right-0 h-screen w-[50vw] max-w-[640px] bg-card border-l border-border shadow-xl flex flex-col z-20 animate-slide-in-right">
      <Tabs defaultValue="metadata" className="h-full flex flex-col">
        <div className="bg-muted/40 border-b border-border">
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-sm font-bold text-foreground truncate">{node.name}</span>
                <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 border-border bg-background shrink-0">
                  {systemLabel}
                </Badge>
              </div>
              <Button
                onClick={handleClose}
                className="h-5 w-5 p-0 ml-2 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground border-0 rounded-md shrink-0"
              >
                <X size={14} />
              </Button>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{node.datasetId}</div>
          </div>

          <TabsList className="grid w-full grid-cols-2 bg-transparent h-8 p-0 gap-0 rounded-none">
            <TabsTrigger
              value="metadata"
              className="rounded-none border-r border-border data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=inactive]:bg-muted/60 data-[state=inactive]:text-muted-foreground font-mono text-xs"
            >
              Metadata
            </TabsTrigger>
            <TabsTrigger
              value="columns"
              className="rounded-none data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=inactive]:bg-muted/60 data-[state=inactive]:text-muted-foreground font-mono text-xs"
            >
              Columns ({node.columns.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="metadata" className="flex-1 mt-0 overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr className="bg-muted/60">
                <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-border">
                  Identity
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] w-[130px] border-r border-border/60">Namespace</td>
                <td className="px-2 py-1 font-mono text-[11px] text-foreground break-all">{node.namespace}</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Table Name</td>
                <td className="px-2 py-1 font-mono text-[11px] text-foreground break-all">{node.name}</td>
              </tr>

              <tr className="bg-muted/60">
                <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-border border-t border-border">
                  Table Metadata
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Description</td>
                <td className="px-2 py-1">
                  <Input value={meta.description || ''} onChange={e => setMeta({...meta, description: e.target.value})} className="h-6 text-xs border-border font-mono rounded-md" />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Environment</td>
                <td className="px-2 py-1">
                  <Select value={meta.environment || "UNASSIGNED"} onValueChange={(val: any) => setMeta({...meta, environment: val === "UNASSIGNED" ? undefined : val})}>
                    <SelectTrigger className="h-6 text-xs border-border font-mono rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNASSIGNED">UNASSIGNED</SelectItem>
                      <SelectItem value="DEV">DEV</SelectItem>
                      <SelectItem value="TEST">TEST</SelectItem>
                      <SelectItem value="UAT">UAT</SelectItem>
                      <SelectItem value="PROD">PROD</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Business Domain</td>
                <td className="px-2 py-1">
                  <Input value={meta.businessDomain || ''} onChange={e => setMeta({...meta, businessDomain: e.target.value})} className="h-6 text-xs border-border font-mono rounded-md" placeholder="Claims, Policy, Billing, Finance" />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Row Count</td>
                <td className="px-2 py-1">
                  <Input type="number" value={meta.rowCount ?? ''} onChange={e => setMeta({...meta, rowCount: e.target.value === '' ? undefined : Number(e.target.value)})} className="h-6 text-xs border-border font-mono rounded-md" />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Column Count</td>
                <td className="px-2 py-1">
                  <Input type="number" value={meta.columnCount ?? ''} onChange={e => setMeta({...meta, columnCount: e.target.value === '' ? undefined : Number(e.target.value)})} className="h-6 text-xs border-border font-mono rounded-md" />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Has Primary Key</td>
                <td className="px-2 py-1">
                  <Select value={meta.hasPrimaryKey === undefined ? "UNASSIGNED" : String(meta.hasPrimaryKey)} onValueChange={(val: any) => setMeta({...meta, hasPrimaryKey: val === "UNASSIGNED" ? undefined : val === "true"})}>
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
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Unique Key Columns</td>
                <td className="px-2 py-1">
                  <Input value={meta.uniqueKeyColumns || ''} onChange={e => setMeta({...meta, uniqueKeyColumns: e.target.value})} className="h-6 text-xs border-border font-mono rounded-md" placeholder="comma-separated column names" />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Grain</td>
                <td className="px-2 py-1">
                  <Input value={meta.grainDescription || ''} onChange={e => setMeta({...meta, grainDescription: e.target.value})} className="h-6 text-xs border-border font-mono rounded-md" placeholder="one row per ..." />
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-2 py-1 bg-muted/40 font-mono text-[11px] border-r border-border/60">Refresh Frequency</td>
                <td className="px-2 py-1">
                  <Select value={meta.refreshFrequency || "UNASSIGNED"} onValueChange={(val: any) => setMeta({...meta, refreshFrequency: val === "UNASSIGNED" ? undefined : val})}>
                    <SelectTrigger className="h-6 text-xs border-border font-mono rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNASSIGNED">UNASSIGNED</SelectItem>
                      <SelectItem value="DAILY">DAILY</SelectItem>
                      <SelectItem value="WEEKLY">WEEKLY</SelectItem>
                      <SelectItem value="MONTHLY">MONTHLY</SelectItem>
                      <SelectItem value="AD_HOC">AD-HOC</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="p-2 border-t-2 border-border">
            {saved && (
              <div className="flex items-center justify-center gap-1 mb-2 text-[11px] font-mono text-green-700">
                <Check size={12} /> Save successful
              </div>
            )}
            <Button onClick={handleSave} className="w-full h-7 bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs rounded-md">
              Save Metadata
            </Button>
          </div>

          <div className="border-t border-border bg-destructive/5">
            <div className="bg-destructive/10 px-2 py-1 border-b border-destructive/20">
              <h3 className="text-[10px] font-mono font-bold text-destructive uppercase">Danger Zone</h3>
            </div>
            <div className="p-2">
              <p className="text-[10px] font-mono text-destructive/90 mb-2">
                Delete table and all edges permanently.
              </p>
              <Button
                onClick={() => {
                  if (confirm('Delete this table and all its edges?')) {
                    deleteTableNode(node.datasetId);
                  }
                }}
                className="h-7 bg-destructive hover:bg-destructive/90 text-white font-mono text-xs rounded-md"
              >
                Delete Table
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="columns" className="flex-1 p-4 mt-0 overflow-y-auto">
          <ColumnManager datasetId={node.datasetId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
