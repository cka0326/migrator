import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  FolderPlus, Plus, ChevronRight, ChevronLeft, ChevronDown, Trash2, GitCompare, Layers, Pencil, Copy, Share2, Upload,
  LayoutDashboard, BarChart3,
} from 'lucide-react';
import type { Project, SavedDashboard } from '../types/models';

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createProject = useStore(state => state.createProject);
  const [name, setName] = useState('');
  const [legacy, setLegacy] = useState('');
  const [target, setTarget] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createProject(name.trim(), legacy.trim() || 'Legacy', target.trim() || 'Target');
    setName(''); setLegacy(''); setTarget('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Claims Migration" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Legacy System</Label>
              <Input value={legacy} onChange={e => setLegacy(e.target.value)} placeholder="e.g., SAS" />
            </div>
            <div className="space-y-2">
              <Label>Target System</Label>
              <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g., Snowflake" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A first canvas will be created automatically.</p>
          <div className="flex justify-end pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="mr-2">Cancel</Button>
            <Button type="submit" disabled={!name.trim()}>Create Project</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectItem({ project }: { project: Project }) {
  const canvases = useStore(state => state.canvases);
  const comparisons = useStore(state => state.comparisons);
  const activeCanvasId = useStore(state => state.activeCanvasId);
  const activeProjectId = useStore(state => state.activeProjectId);
  const activeComparisonId = useStore(state => state.activeComparisonId);
  const view = useStore(state => state.view);
  const selectCanvas = useStore(state => state.selectCanvas);
  const createCanvas = useStore(state => state.createCanvas);
  const renameCanvas = useStore(state => state.renameCanvas);
  const deleteCanvas = useStore(state => state.deleteCanvas);
  const cloneCanvas = useStore(state => state.cloneCanvas);
  const cloneProject = useStore(state => state.cloneProject);
  const renameProject = useStore(state => state.renameProject);
  const deleteProject = useStore(state => state.deleteProject);
  const selectProject = useStore(state => state.selectProject);
  const setView = useStore(state => state.setView);
  const openComparison = useStore(state => state.openComparison);
  const deleteComparison = useStore(state => state.deleteComparison);
  const exportProject = useStore(state => state.exportProject);
  const exportComparison = useStore(state => state.exportComparison);

  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleExportProject = async () => {
    setBusy(true);
    try { await exportProject(project.id); }
    catch (e) { alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };

  const handleExportComparison = async (id: string) => {
    try { await exportComparison(id); }
    catch (e) { alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const projectCanvases = Object.values(canvases)
    .filter(c => c.projectId === project.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const projectComparisons = Object.values(comparisons)
    .filter(c => c.projectId === project.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handleAddCanvas = async () => {
    // Auto-name the snapshot with the current local time (YYYY-MM-DD-HH-MM).
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
    const id = await createCanvas(project.id, name);
    await selectCanvas(id);
  };

  const handleCompare = () => {
    selectProject(project.id);
    openComparison(project.id, null);
  };

  const handleCloneProject = async () => {
    const name = window.prompt('Name for the copied project:', `${project.name} (copy)`);
    if (!name) return;
    await cloneProject(project.id, name.trim());
  };

  return (
    <div className="mb-1">
      <div className="group flex items-center gap-1 px-2 py-1.5 rounded hover:bg-slate-100">
        <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-700">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{project.name}</div>
          <div className="text-[10px] text-slate-400 truncate">
            {project.legacySystemName} → {project.targetSystemName}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button title="Compare tables" onClick={handleCompare} className="p-1 text-slate-400 hover:text-primary">
            <GitCompare size={13} />
          </button>
          <button title="Add canvas" onClick={handleAddCanvas} className="p-1 text-slate-400 hover:text-primary">
            <Plus size={14} />
          </button>
          <button title="Duplicate project" onClick={handleCloneProject} className="p-1 text-slate-400 hover:text-primary">
            <Copy size={13} />
          </button>
          <button title="Share / export project (.zip)" onClick={handleExportProject} disabled={busy} className="p-1 text-slate-400 hover:text-primary disabled:opacity-50">
            <Share2 size={13} />
          </button>
          <button
            title="Rename project"
            onClick={() => {
              const n = window.prompt('Rename project:', project.name);
              if (n && n.trim()) renameProject(project.id, n.trim());
            }}
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <Pencil size={12} />
          </button>
          <button
            title="Delete project"
            onClick={() => {
              if (confirm(`Delete project "${project.name}" and all its canvases?`)) deleteProject(project.id);
            }}
            className="p-1 text-slate-400 hover:text-red-600"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-5 mt-0.5 border-l border-slate-200 pl-2">
          {projectCanvases.length === 0 && (
            <div className="text-[11px] text-slate-400 py-1 px-1">No canvases — add one.</div>
          )}
          {projectCanvases.map(canvas => {
            const isActive = view === 'canvas' && activeCanvasId === canvas.id;
            return (
              <div
                key={canvas.id}
                className={`group/canvas flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm ${
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => selectCanvas(canvas.id)}
              >
                <Layers size={12} className="shrink-0 opacity-70" />
                <span className="flex-1 truncate">{canvas.name}</span>
                <span className="flex items-center gap-0.5 opacity-0 group-hover/canvas:opacity-100">
                  <button
                    title="Duplicate canvas"
                    onClick={(e) => {
                      e.stopPropagation();
                      const n = window.prompt('Name for the copied canvas:', `${canvas.name} (copy)`);
                      if (n && n.trim()) cloneCanvas(canvas.id, n.trim());
                    }}
                    className="p-0.5 text-slate-400 hover:text-primary"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    title="Rename canvas"
                    onClick={(e) => {
                      e.stopPropagation();
                      const n = window.prompt('Rename canvas:', canvas.name);
                      if (n && n.trim()) renameCanvas(canvas.id, n.trim());
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-700"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    title="Delete canvas"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete canvas "${canvas.name}" and all its tables?`)) deleteCanvas(canvas.id);
                    }}
                    className="p-0.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              </div>
            );
          })}

          {/* Saved comparison views */}
          {projectComparisons.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-100">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2 mb-0.5">Saved comparisons</div>
              {projectComparisons.map(cmp => {
                const isActive = view === 'compare' && activeComparisonId === cmp.id;
                return (
                  <div
                    key={cmp.id}
                    className={`group/cmp flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm ${
                      isActive ? 'bg-primary/10 text-primary font-medium' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    onClick={() => openComparison(project.id, cmp.id)}
                  >
                    <GitCompare size={12} className="shrink-0 opacity-70" />
                    <span className="flex-1 truncate">{cmp.name}</span>
                    <button
                      title="Share / export comparison (.zip)"
                      onClick={(e) => { e.stopPropagation(); handleExportComparison(cmp.id); }}
                      className="p-0.5 text-slate-400 hover:text-primary opacity-0 group-hover/cmp:opacity-100"
                    >
                      <Share2 size={11} />
                    </button>
                    <button
                      title="Delete comparison"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete comparison "${cmp.name}"?`)) deleteComparison(cmp.id); }}
                      className="p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover/cmp:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeProjectId === project.id && view === 'compare' && !activeComparisonId && (
        <div className="ml-5 mt-0.5 pl-2 text-[11px] text-primary font-medium px-2 py-1">● Unsaved comparison open</div>
      )}
    </div>
  );
}

function DashboardItem({ dashboard }: { dashboard: SavedDashboard }) {
  const projects = useStore(state => state.projects);
  const view = useStore(state => state.view);
  const activeDashboardId = useStore(state => state.activeDashboardId);
  const openDashboard = useStore(state => state.openDashboard);
  const deleteDashboard = useStore(state => state.deleteDashboard);
  const saveDashboard = useStore(state => state.saveDashboard);
  const exportDashboard = useStore(state => state.exportDashboard);

  const isActive = view === 'dashboard' && activeDashboardId === dashboard.id;
  const projectName = projects[dashboard.projectId]?.name ?? '(deleted project)';

  return (
    <div
      className={`group/dash flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-sm ${
        isActive ? 'bg-primary/10 text-primary font-medium' : 'text-slate-600 hover:bg-slate-100'
      }`}
      onClick={() => openDashboard(dashboard.id)}
    >
      <BarChart3 size={13} className="shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{dashboard.name}</div>
        <div className="text-[10px] text-slate-400 truncate">{projectName} · {dashboard.scope === 'trend' ? 'trend' : 'snapshot'}</div>
      </div>
      <span className="flex items-center gap-0.5 opacity-0 group-hover/dash:opacity-100">
        <button title="Export dashboard (.zip)" onClick={(e) => { e.stopPropagation(); exportDashboard(dashboard.id); }} className="p-0.5 text-slate-400 hover:text-primary">
          <Share2 size={11} />
        </button>
        <button
          title="Rename dashboard"
          onClick={(e) => {
            e.stopPropagation();
            const n = window.prompt('Rename dashboard:', dashboard.name);
            if (n && n.trim()) saveDashboard({ ...dashboard, name: n.trim(), updatedAt: new Date().toISOString() });
          }}
          className="p-0.5 text-slate-400 hover:text-slate-700"
        >
          <Pencil size={11} />
        </button>
        <button
          title="Delete dashboard"
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete dashboard "${dashboard.name}"?`)) deleteDashboard(dashboard.id); }}
          className="p-0.5 text-slate-400 hover:text-red-600"
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 256;

export function ProjectSidebar() {
  const projects = useStore(state => state.projects);
  const dashboards = useStore(state => state.dashboards);
  const importProject = useStore(state => state.importProject);
  const importComparison = useStore(state => state.importComparison);
  const importDashboard = useStore(state => state.importDashboard);
  const openDashboard = useStore(state => state.openDashboard);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<'projects' | 'dashboards'>('projects');
  const projectFileRef = useRef<HTMLInputElement>(null);
  const comparisonFileRef = useRef<HTMLInputElement>(null);
  const dashboardFileRef = useRef<HTMLInputElement>(null);

  const runImport = async (file: File | undefined, fn: (f: File) => Promise<void>, kind: string) => {
    if (!file) return;
    setImporting(true);
    try { await fn(file); }
    catch (e) { alert(`${kind} import failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setImporting(false); }
  };

  // Collapsed + width are user preferences, persisted across reloads.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar:collapsed') === '1');
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sidebar:width'));
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
  });
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => { localStorage.setItem('sidebar:collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { localStorage.setItem('sidebar:width', String(width)); }, [width]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const left = asideRef.current?.getBoundingClientRect().left ?? 0;
    const onMove = (ev: MouseEvent) => {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX - left)));
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const projectList = Object.values(projects).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dashboardList = Object.values(dashboards).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Collapsed: a slim rail with controls to reopen.
  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 h-full border-r bg-white flex flex-col items-center py-3 gap-3">
        <img src="/logo.svg" alt="DataTrace" title="DataTrace" className="h-6 w-6" />
        <button title="Expand sidebar" onClick={() => setCollapsed(false)} className="text-slate-500 hover:text-slate-800">
          <ChevronRight size={18} />
        </button>
        <button title="New project" onClick={() => { setCollapsed(false); setTab('projects'); setNewProjectOpen(true); }} className="text-slate-500 hover:text-primary">
          <FolderPlus size={16} />
        </button>
        <button title="Dashboards" onClick={() => { setCollapsed(false); setTab('dashboards'); }} className="text-slate-500 hover:text-primary">
          <LayoutDashboard size={16} />
        </button>
        <span className="text-[10px] font-semibold tracking-wider text-slate-400 [writing-mode:vertical-rl] mt-1">DATATRACE</span>
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      </aside>
    );
  }

  return (
    <aside ref={asideRef} style={{ width }} className="relative shrink-0 h-full border-r bg-white flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <img src="/logo.svg" alt="DataTrace" className="h-7 w-7 shrink-0" />
        <span className="text-base font-bold tracking-tight text-slate-800">DataTrace</span>
        <button title="Collapse sidebar" onClick={() => setCollapsed(true)} className="ml-auto p-1 text-slate-400 hover:text-slate-700">
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Top-level tab switch */}
      <div className="flex items-center gap-1 px-2 pt-2">
        <button
          onClick={() => setTab('projects')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md ${tab === 'projects' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Layers size={14} /> Projects
        </button>
        <button
          onClick={() => setTab('dashboards')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md ${tab === 'dashboards' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <LayoutDashboard size={14} /> Dashboards
        </button>
      </div>

      {tab === 'projects' ? (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b mt-1">
            <h2 className="text-sm font-semibold tracking-tight text-slate-700">Projects</h2>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setNewProjectOpen(true)}>
                <FolderPlus size={14} className="mr-1" /> New
              </Button>
              <button title="Import project bundle (.zip)" disabled={importing} onClick={() => projectFileRef.current?.click()} className="p-1 text-slate-400 hover:text-primary disabled:opacity-50">
                <Upload size={15} />
              </button>
              <button title="Import comparison bundle (.zip)" disabled={importing} onClick={() => comparisonFileRef.current?.click()} className="p-1 text-slate-400 hover:text-primary disabled:opacity-50">
                <GitCompare size={15} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {projectList.length === 0 ? (
              <div className="text-center text-slate-400 text-xs py-10 px-4">
                No projects yet.<br />Click <span className="font-medium">New</span> to create one.
              </div>
            ) : (
              projectList.map(p => <ProjectItem key={p.id} project={p} />)
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b mt-1">
            <h2 className="text-sm font-semibold tracking-tight text-slate-700">Dashboards</h2>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openDashboard(null)} title="Open a new migration status dashboard">
                <Plus size={14} className="mr-1" /> New
              </Button>
              <button title="Import dashboard bundle (.zip)" disabled={importing} onClick={() => dashboardFileRef.current?.click()} className="p-1 text-slate-400 hover:text-primary disabled:opacity-50">
                <Upload size={15} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <button
              onClick={() => openDashboard(null)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-slate-500 hover:bg-slate-100 border border-dashed border-slate-200"
            >
              <Plus size={13} /> New live dashboard
            </button>
            {dashboardList.length === 0 ? (
              <div className="text-center text-slate-400 text-xs py-8 px-4">
                No saved dashboards.<br />Open one and click <span className="font-medium">Save</span>.
              </div>
            ) : (
              dashboardList.map(d => <DashboardItem key={d.id} dashboard={d} />)
            )}
          </div>
        </>
      )}

      <input ref={projectFileRef} type="file" accept=".zip" className="hidden"
        onChange={e => { runImport(e.target.files?.[0], importProject, 'Project'); e.target.value = ''; }} />
      <input ref={comparisonFileRef} type="file" accept=".zip" className="hidden"
        onChange={e => { runImport(e.target.files?.[0], importComparison, 'Comparison'); e.target.value = ''; }} />
      <input ref={dashboardFileRef} type="file" accept=".zip" className="hidden"
        onChange={e => { runImport(e.target.files?.[0], importDashboard, 'Dashboard'); e.target.value = ''; }} />

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />

      {/* Drag handle to resize the sidebar */}
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/40 transition-colors"
      />
    </aside>
  );
}
