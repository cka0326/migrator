import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  FolderPlus, Plus, ChevronRight, ChevronDown, Trash2, GitCompare, Layers, Pencil, Copy,
} from 'lucide-react';
import type { Project } from '../types/models';

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

  const [expanded, setExpanded] = useState(true);

  const projectCanvases = Object.values(canvases)
    .filter(c => c.projectId === project.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const projectComparisons = Object.values(comparisons)
    .filter(c => c.projectId === project.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handleAddCanvas = async () => {
    const name = window.prompt('New canvas name (a point-in-time snapshot):', `Canvas ${projectCanvases.length + 1}`);
    if (!name) return;
    const id = await createCanvas(project.id, name.trim());
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

export function ProjectSidebar() {
  const projects = useStore(state => state.projects);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const projectList = Object.values(projects).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <aside className="w-64 shrink-0 h-full border-r bg-white flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <h2 className="text-sm font-semibold tracking-tight text-slate-700">Projects</h2>
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setNewProjectOpen(true)}>
          <FolderPlus size={14} className="mr-1" /> New
        </Button>
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

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </aside>
  );
}
