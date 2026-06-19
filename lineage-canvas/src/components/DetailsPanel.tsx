import { useStore } from '../store/useStore';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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

  useEffect(() => {
    if (node) {
      setMeta(node.metadata);
    }
  }, [node]);

  if (!node || !meta) return null;

  const handleSave = () => {
    updateTableMetadata(node.datasetId, meta);
  };

  const handleClose = () => {
    selectNode(null);
  };

  if (!selectedNodeId || !node || !meta) return null;

  return (
    <div className="fixed top-0 right-0 h-screen w-[50vw] bg-[#f5f5f5] border-l-2 border-[#cccccc] flex flex-col z-20">
      <Tabs defaultValue="metadata" className="h-full flex flex-col">
        <div className="bg-gradient-to-b from-[#e8e8e8] to-[#d0d0d0] border-b-2 border-[#999999]">
          <div className="px-3 py-2 border-b border-[#bbbbbb]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-sm font-bold text-[#333333] truncate">{node.name}</span>
                <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 border-[#999999] bg-[#ffffff] shrink-0">
                  {systemLabel}
                </Badge>
              </div>
              <Button
                onClick={handleClose}
                className="h-5 w-5 p-0 ml-2 bg-transparent hover:bg-[#cccccc] text-[#666666] hover:text-[#333333] border-0 rounded-none shrink-0"
              >
                <X size={14} />
              </Button>
            </div>
            <div className="text-[10px] font-mono text-[#666666] mt-0.5 truncate">{node.datasetId}</div>
          </div>

          <TabsList className="grid w-full grid-cols-2 bg-transparent h-8 p-0 gap-0">
            <TabsTrigger
              value="metadata"
              className="rounded-none border-r border-[#999999] data-[state=active]:bg-[#f5f5f5] data-[state=inactive]:bg-[#d8d8d8] data-[state=active]:border-b-2 data-[state=active]:border-b-[#f5f5f5] font-mono text-xs"
            >
              Metadata
            </TabsTrigger>
            <TabsTrigger
              value="columns"
              className="rounded-none data-[state=active]:bg-[#f5f5f5] data-[state=inactive]:bg-[#d8d8d8] data-[state=active]:border-b-2 data-[state=active]:border-b-[#f5f5f5] font-mono text-xs"
            >
              Columns ({node.columns.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="metadata" className="flex-1 mt-0 overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
                <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999]">
                  Identity
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] w-[130px] border-r border-[#dddddd]">Namespace</td>
                <td className="px-2 py-1 font-mono text-[11px] text-[#333333]">{node.namespace}</td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Table Name</td>
                <td className="px-2 py-1 font-mono text-[11px] text-[#333333]">{node.name}</td>
              </tr>

              <tr className="bg-gradient-to-b from-[#e0e0e0] to-[#d5d5d5]">
                <td colSpan={2} className="px-2 py-1 font-mono font-bold text-[10px] uppercase border-b border-[#999999] border-t-2 border-t-[#999999]">
                  Table Metadata
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Description</td>
                <td className="px-2 py-1">
                  <Input value={meta.description || ''} onChange={e => setMeta({...meta, description: e.target.value})} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Environment</td>
                <td className="px-2 py-1">
                  <Select value={meta.environment || "UNASSIGNED"} onValueChange={(val: any) => setMeta({...meta, environment: val === "UNASSIGNED" ? undefined : val})}>
                    <SelectTrigger className="h-6 text-xs border-[#999999] font-mono rounded-none">
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
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Business Domain</td>
                <td className="px-2 py-1">
                  <Input value={meta.businessDomain || ''} onChange={e => setMeta({...meta, businessDomain: e.target.value})} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="Claims, Policy, Billing, Finance" />
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Row Count</td>
                <td className="px-2 py-1">
                  <Input type="number" value={meta.rowCount ?? ''} onChange={e => setMeta({...meta, rowCount: e.target.value === '' ? undefined : Number(e.target.value)})} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Column Count</td>
                <td className="px-2 py-1">
                  <Input type="number" value={meta.columnCount ?? ''} onChange={e => setMeta({...meta, columnCount: e.target.value === '' ? undefined : Number(e.target.value)})} className="h-6 text-xs border-[#999999] font-mono rounded-none" />
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Has Primary Key</td>
                <td className="px-2 py-1">
                  <Select value={meta.hasPrimaryKey === undefined ? "UNASSIGNED" : String(meta.hasPrimaryKey)} onValueChange={(val: any) => setMeta({...meta, hasPrimaryKey: val === "UNASSIGNED" ? undefined : val === "true"})}>
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
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Unique Key Columns</td>
                <td className="px-2 py-1">
                  <Input value={meta.uniqueKeyColumns || ''} onChange={e => setMeta({...meta, uniqueKeyColumns: e.target.value})} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="comma-separated column names" />
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Grain</td>
                <td className="px-2 py-1">
                  <Input value={meta.grainDescription || ''} onChange={e => setMeta({...meta, grainDescription: e.target.value})} className="h-6 text-xs border-[#999999] font-mono rounded-none" placeholder="one row per ..." />
                </td>
              </tr>
              <tr className="border-b border-[#dddddd]">
                <td className="px-2 py-1 bg-[#eeeeee] font-mono text-[11px] border-r border-[#dddddd]">Refresh Frequency</td>
                <td className="px-2 py-1">
                  <Select value={meta.refreshFrequency || "UNASSIGNED"} onValueChange={(val: any) => setMeta({...meta, refreshFrequency: val === "UNASSIGNED" ? undefined : val})}>
                    <SelectTrigger className="h-6 text-xs border-[#999999] font-mono rounded-none">
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

          <div className="p-2 border-t-2 border-[#999999]">
            <Button onClick={handleSave} className="w-full h-7 bg-gradient-to-b from-[#5b9dd9] to-[#306b9c] hover:from-[#6aadea] hover:to-[#407cb0] text-white font-mono text-xs rounded-none border border-[#234567]">
              Save Metadata
            </Button>
          </div>

          <div className="border-t-2 border-[#999999] bg-[#ffe0e0]">
            <div className="bg-gradient-to-b from-[#f5d0d0] to-[#eababa] px-2 py-1 border-b border-[#cc9999]">
              <h3 className="text-[10px] font-mono font-bold text-[#cc0000] uppercase">Danger Zone</h3>
            </div>
            <div className="p-2">
              <p className="text-[10px] font-mono text-[#990000] mb-2">
                Delete table and all edges permanently.
              </p>
              <Button
                onClick={() => {
                  if (confirm('Delete this table and all its edges?')) {
                    deleteTableNode(node.datasetId);
                  }
                }}
                className="h-7 bg-gradient-to-b from-[#dd5555] to-[#aa3333] hover:from-[#ee6666] hover:to-[#bb4444] text-white font-mono text-xs rounded-none border border-[#770000]"
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
