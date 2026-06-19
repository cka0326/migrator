import { useState, useEffect } from 'react';
import { db } from '../db/database';
import type { UploadRec } from '../types/models';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useStore } from '../store/useStore';

export function UploadsRegistry() {
  const [uploads, setUploads] = useState<UploadRec[]>([]);
  const [open, setOpen] = useState(false);

  const activeCanvasId = useStore(state => state.activeCanvasId);

  useEffect(() => {
    if (open) {
      db.uploadRecs.toArray().then(recs => {
        const scoped = activeCanvasId ? recs.filter(r => r.canvasId === activeCanvasId) : recs;
        setUploads(scoped.sort((a,b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
      });
    }
  }, [open, activeCanvasId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this upload? Edges and stubs created by this upload will be removed.')) return;
    const { Repository } = await import('../db/repository');
    await Repository.deleteUpload(id);
    setUploads(uploads.filter(u => u.uploadId !== id));
    const cid = useStore.getState().activeCanvasId;
    if (cid) useStore.getState().loadCanvas(cid);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" />}>
        Upload History
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Uploads Registry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
           {uploads.length === 0 ? (
             <div className="text-center text-muted-foreground py-8">No uploads found.</div>
           ) : (
             <table className="w-full text-sm">
               <thead>
                 <tr className="border-b">
                   <th className="text-left py-2 font-medium">Date</th>
                   <th className="text-left py-2 font-medium">File</th>
                   <th className="text-left py-2 font-medium">Type</th>
                   <th className="text-left py-2 font-medium">Status</th>
                   <th className="text-left py-2 font-medium">Summary</th>
                   <th className="text-right py-2 font-medium">Actions</th>
                 </tr>
               </thead>
               <tbody>
                 {uploads.map(u => (
                   <tr key={u.uploadId} className="border-b last:border-0 hover:bg-muted/50">
                     <td className="py-2">{new Date(u.uploadedAt).toLocaleString()}</td>
                     <td className="py-2 font-mono text-xs">{u.fileName}</td>
                     <td className="py-2"><Badge variant="outline">{u.kind}</Badge></td>
                     <td className="py-2">
                       <Badge variant={u.status === 'ACTIVE' ? 'default' : 'secondary'}>{u.status}</Badge>
                     </td>
                     <td className="py-2 text-xs text-muted-foreground">
                        {u.summary?.datasets !== undefined ? `${u.summary.datasets} datasets` : ''}
                        {u.summary?.tableEdges !== undefined ? `, ${u.summary.tableEdges} edges` : ''}
                     </td>
                     <td className="py-2 text-right">
                       <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 text-xs" onClick={() => handleDelete(u.uploadId)}>Delete</Button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
