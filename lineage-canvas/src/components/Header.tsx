import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Undo2, Redo2, Search, Database, Download, ChevronDown, FileSpreadsheet, FileJson, FileText } from 'lucide-react';
import { NewTableDialog } from './NewTableDialog';
import { UploadsRegistry } from './UploadsRegistry';
import { ImportValidationDialog } from './ImportValidationDialog';
import type { ParsedImportModel } from '../lib/importModel';
import { useState, useRef, useEffect } from 'react';

interface PendingImport {
  source: 'JSON' | 'EXCEL';
  model: ParsedImportModel;
  rawPayload?: string;
  fileName: string;
}

// Trigger a browser download of a static asset shipped under public/.
function downloadAsset(path: string, filename: string) {
  const a = document.createElement('a');
  a.href = `${import.meta.env.BASE_URL}${path}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function Header() {
  // @ts-ignore
  const { undo, redo, pastStates, futureStates } = useStore.temporal?.getState?.() || { undo: () => {}, redo: () => {}, pastStates: [], futureStates: [] };

  const nodes = useStore(state => state.nodes);
  const selectNode = useStore(state => state.selectNode);
  const activeCanvasId = useStore(state => state.activeCanvasId);
  const project = useStore(state => state.activeProjectId ? state.projects[state.activeProjectId] : null);
  const canvas = useStore(state => state.activeCanvasId ? state.canvases[state.activeCanvasId] : null);

  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

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
    <header className="flex justify-between items-center gap-3 px-3 py-1.5 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <img src="/logo.svg" alt="DataTrace" className="h-6 w-6 shrink-0" />
        <div className="flex flex-col leading-tight min-w-0">
          <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
            {project ? project.name : 'DataTrace'}
          </h1>
          {canvas && (
            <span className="text-[11px] text-muted-foreground truncate">{canvas.name}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 border-l pl-3 border-border">
          <Button variant="ghost" size="icon" onClick={() => undo()} disabled={pastStates.length === 0} title="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => redo()} disabled={futureStates.length === 0} title="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative ml-2 flex-1 max-w-md" ref={searchRef}>
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-8 h-8 text-sm w-full"
          />

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50 animate-fade-in-up">
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
            <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg p-4 z-50 animate-fade-in-up">
              <p className="text-sm text-slate-500 text-center">No tables found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <UploadsRegistry />
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <Download size={14} className="mr-1" /> Downloads <ChevronDown size={13} className="ml-1 opacity-60" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Excel</div>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground" onClick={() => downloadAsset('templates/Lineage_Canvas_Template.xlsx', 'Lineage_Canvas_Template.xlsx')}>
              <FileSpreadsheet size={14} className="text-emerald-600" /> Excel template
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground" onClick={() => downloadAsset('templates/Lineage_Canvas_Sample_Filled.xlsx', 'Lineage_Canvas_Sample_Filled.xlsx')}>
              <FileSpreadsheet size={14} className="text-emerald-600/70" /> Filled sample
            </button>
            <div className="mt-1 border-t pt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI extraction (JSON)</div>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground" onClick={() => downloadAsset('extraction/lineage-extract.schema.json', 'lineage-extract.schema.json')}>
              <FileJson size={14} className="text-amber-600" /> JSON schema
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground" onClick={() => downloadAsset('extraction/prompt-sas.md', 'prompt-sas.md')}>
              <FileText size={14} className="text-blue-600" /> Prompt — SAS
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground" onClick={() => downloadAsset('extraction/prompt-sql.md', 'prompt-sql.md')}>
              <FileText size={14} className="text-blue-600" /> Prompt — SQL
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground" onClick={() => downloadAsset('extraction/prompt-snowflake.md', 'prompt-snowflake.md')}>
              <FileText size={14} className="text-blue-600" /> Prompt — Snowflake
            </button>
          </PopoverContent>
        </Popover>

        <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-lg text-[0.8rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-7 px-2.5">
          Upload Excel
          <input type="file" className="hidden" accept=".xlsx" onChange={async (e) => {
             const file = e.target.files?.[0];
             if (file) {
                try {
                  const { parseExcelWorkbook } = await import('../lib/excelService');
                  const { model, warnings } = await parseExcelWorkbook(file);
                  if (warnings.length) alert(warnings.join('\n'));
                  if (model.tables.length > 0) setPendingImport({ source: 'EXCEL', model, fileName: file.name });
                } catch (err) {
                  alert(`Excel parse failed: ${err instanceof Error ? err.message : String(err)}`);
                }
             }
             e.target.value = '';
          }} />
        </label>

        <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-lg text-[0.8rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-7 px-2.5">
          Upload JSON
          <input type="file" className="hidden" accept=".json" onChange={async (e) => {
             const file = e.target.files?.[0];
             if (file) {
                try {
                  const { parseLineageJSON } = await import('../lib/uploadService');
                  const { model, rawPayload } = await parseLineageJSON(file);
                  setPendingImport({ source: 'JSON', model, rawPayload, fileName: file.name });
                } catch (err) {
                  alert(`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
                }
             }
             e.target.value = '';
          }} />
        </label>
        <NewTableDialog />
      </div>

      <ImportValidationDialog
        open={!!pendingImport}
        onOpenChange={(o) => { if (!o) setPendingImport(null); }}
        source={pendingImport?.source ?? 'JSON'}
        model={pendingImport?.model ?? null}
        rawPayload={pendingImport?.rawPayload}
        fileName={pendingImport?.fileName ?? ''}
      />
    </header>
  );
}
