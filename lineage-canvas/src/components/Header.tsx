import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Undo2, Redo2, Search, Database } from 'lucide-react';
import { NewTableDialog } from './NewTableDialog';
import { UploadsRegistry } from './UploadsRegistry';
import { useState, useRef, useEffect } from 'react';

export function Header() {
  // @ts-ignore
  const { undo, redo, pastStates, futureStates } = useStore.temporal?.getState?.() || { undo: () => {}, redo: () => {}, pastStates: [], futureStates: [] };

  const nodes = useStore(state => state.nodes);
  const selectNode = useStore(state => state.selectNode);
  const activeCanvasId = useStore(state => state.activeCanvasId);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);
  const canvas = useStore(state => state.activeCanvasId ? state.canvases[state.activeCanvasId] : null);

  const reloadActiveCanvas = () => {
    const cid = useStore.getState().activeCanvasId;
    if (cid) useStore.getState().loadCanvas(cid);
  };

  const systemLabel = (system: string) =>
    system === 'LEGACY' ? (project?.legacySystemName || 'Legacy') : (project?.targetSystemName || 'Target');

  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Filter nodes based on search query
  const searchResults = searchQuery.trim()
    ? Object.values(nodes).filter(node =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.datasetId.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 10) // Limit to 10 results
    : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectNode = (nodeId: string) => {
    selectNode(nodeId);
    setSearchQuery('');
    setShowResults(false);
  };

  return (
    <header className="flex justify-between items-center px-4 py-3 border-b bg-background shadow-sm sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex flex-col leading-tight">
          <h1 className="text-base font-semibold tracking-tight text-primary">
            {project ? project.name : 'Lineage Canvas'}
          </h1>
          {canvas && (
            <span className="text-xs text-muted-foreground">{canvas.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 border-l pl-4 border-border">
          <Button variant="ghost" size="icon" onClick={() => undo()} disabled={pastStates.length === 0} title="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => redo()} disabled={futureStates.length === 0} title="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative ml-4 flex-1 max-w-md" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9 h-9 text-sm w-full"
          />

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-96 overflow-y-auto z-50">
              {searchResults.map((node) => (
                <div
                  key={node.datasetId}
                  onClick={() => handleSelectNode(node.datasetId)}
                  className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                >
                  <Database className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-slate-900 truncate">{node.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">{systemLabel(node.system)}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{node.datasetId}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showResults && searchQuery.trim() && searchResults.length === 0 && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg p-4 z-50">
              <p className="text-sm text-slate-500 text-center">No tables found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <UploadsRegistry />
        <Button variant="outline" onClick={() => {
           const a = document.createElement('a');
           a.href = `${import.meta.env.BASE_URL}templates/Lineage_Canvas_Template.xlsx`;
           a.download = 'Lineage_Canvas_Template.xlsx';
           document.body.appendChild(a);
           a.click();
           a.remove();
        }}>Download Template</Button>

        <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
          Upload Excel
          <input type="file" className="hidden" accept=".xlsx" onChange={async (e) => {
             const file = e.target.files?.[0];
             if (file) {
                try {
                  const { processExcelUpload } = await import('../lib/excelService');
                  const targetCanvasId = await processExcelUpload(file, activeCanvasId);
                  // The MASTER sheet may have created a new project/canvas.
                  await useStore.getState().loadProjects();
                  await useStore.getState().selectCanvas(targetCanvasId);
                } catch (err) {
                  alert(`Excel upload failed: ${err instanceof Error ? err.message : String(err)}`);
                }
             }
             e.target.value = '';
          }} />
        </label>

        <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
          Upload JSON
          <input type="file" className="hidden" accept=".json" disabled={!activeCanvasId} onChange={async (e) => {
             const file = e.target.files?.[0];
             if (file && activeCanvasId) {
                const { processLineageUpload } = await import('../lib/uploadService');
                await processLineageUpload(file, activeCanvasId);
                reloadActiveCanvas();
             }
             e.target.value = '';
          }} />
        </label>
        <NewTableDialog />
      </div>
    </header>
  );
}
