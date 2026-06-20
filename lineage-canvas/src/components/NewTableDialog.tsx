import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { System, TableNode } from '../types/models';

export function NewTableDialog() {
  const [open, setOpen] = useState(false);
  const addTableNode = useStore(state => state.addTableNode);
  const nodes = useStore(state => state.nodes);
  const activeCanvasId = useStore(state => state.activeCanvasId);
  const activeSystemTab = useStore(state => state.activeSystemTab);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);

  const [system, setSystem] = useState<System>(activeSystemTab);
  const [namespace, setNamespace] = useState('');
  const [name, setName] = useState('');

  // Keep the dialog's default system in sync with the tab the user is on when they open it.
  useEffect(() => {
    if (open) setSystem(activeSystemTab);
  }, [open, activeSystemTab]);

  const legacyLabel = project?.legacySystemName || 'Legacy';
  const targetLabel = project?.targetSystemName || 'Target';

  const datasetId = `${activeCanvasId}::${system}:${namespace ? namespace.toUpperCase() + '.' : ''}${name.toUpperCase()}`;
  const isDuplicate = !!nodes[datasetId];
  const canSubmit = !!activeCanvasId && namespace.trim() && name.trim() && !isDuplicate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !activeCanvasId) return;

    // Calculate a default position to avoid stacking at 0,0
    const existingNodesList = Object.values(nodes);
    const laneNodes = existingNodesList.filter(n => n.system === system);
    let posX = 100;
    let posY = 100;

    if (laneNodes.length > 0) {
      let maxX = 100;
      let sumY = 0;
      let countWithPos = 0;
      for (const n of laneNodes) {
        if (n.position) {
          if (n.position.x > maxX) maxX = n.position.x;
          sumY += n.position.y;
          countWithPos++;
        }
      }
      posX = maxX + 320;
      if (countWithPos > 0) {
        posY = Math.round(sumY / countWithPos);
      }
    }

    const node: TableNode = {
      datasetId,
      canvasId: activeCanvasId,
      system,
      namespace: namespace.toUpperCase(),
      name: name.toUpperCase(),
      qualifiedName: `${namespace.toUpperCase()}.${name.toUpperCase()}`,
      origin: 'MANUAL',
      completeness: 'PARTIAL',
      metadata: {},
      columns: [],
      referencedByUploadIds: [],
      position: { x: posX, y: posY },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addTableNode(node);
    setOpen(false);
    setNamespace('');
    setName('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" />}>
        + New Table
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Table</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>System</Label>
            <Select value={system} onValueChange={(val) => setSystem(val as System)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEGACY">{legacyLabel} (Legacy)</SelectItem>
                <SelectItem value="TARGET">{targetLabel} (Target)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Namespace (Schema/Library)</Label>
            <Input required value={namespace} onChange={e => setNamespace(e.target.value)} placeholder="e.g., WORK or SALESLIB" />
          </div>
          <div className="space-y-2">
            <Label>Table Name</Label>
            <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g., CUSTOMERS" />
          </div>
          <div className="text-sm text-muted-foreground p-2 bg-slate-100 rounded break-all">
            <strong>ID:</strong> {datasetId}
            {isDuplicate && <p className="text-red-500 mt-1">A table with this ID already exists.</p>}
            <p className="mt-1 text-xs">Note: The system, namespace, and name are immutable after creation.</p>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="mr-2">Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>Create Table</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
