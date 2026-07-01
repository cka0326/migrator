import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { Header } from './components/Header';
import { DetailsPanel } from './components/DetailsPanel';
import { ColumnEditorPanel } from './components/ColumnEditorPanel';
import { LineageGraph } from './components/canvas/LineageGraph';
import { ProjectSidebar } from './components/ProjectSidebar';
import { CompareView } from './components/compare/CompareView';
import { MappingView } from './components/mapping/MappingView';

function App() {
  const initSession = useStore(state => state.initSession);
  const view = useStore(state => state.view);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // Global Esc "go back a level": close the column details panel, then the table
  // details panel, then exit column-lineage tracing. Reads fresh store state so
  // it needn't re-subscribe. `defaultPrevented` lets dialogs / popovers / the
  // table search consume Esc first; preventing default signals lower-priority
  // handlers (e.g. the canvas connector-selection) to stand down this press.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const s = useStore.getState();
      if (s.view !== 'canvas') return;
      if (s.selectedColumn) { s.selectColumn(null, null); e.preventDefault(); return; }
      if (s.selectedNodeId) { s.selectNode(null); e.preventDefault(); return; }
      if (s.columnFocus) { s.clearColumnFocus(); e.preventDefault(); return; }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden text-left">
      <ProjectSidebar />
      <div className="flex-1 flex flex-col min-w-0 relative">
        {view === 'compare' ? (
          <CompareView />
        ) : view === 'mapping' ? (
          <MappingView />
        ) : (
          <>
            <Header />
            <div className="flex-1 relative">
              <LineageGraph />
            </div>
            <ColumnEditorPanel />
            <DetailsPanel />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
