import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { Header } from './components/Header';
import { DetailsPanel } from './components/DetailsPanel';
import { ColumnEditorPanel } from './components/ColumnEditorPanel';
import { LineageGraph } from './components/canvas/LineageGraph';
import { ProjectSidebar } from './components/ProjectSidebar';
import { CompareView } from './components/compare/CompareView';

function App() {
  const initSession = useStore(state => state.initSession);
  const view = useStore(state => state.view);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden text-left">
      <ProjectSidebar />
      <div className="flex-1 flex flex-col min-w-0 relative">
        {view === 'compare' ? (
          <CompareView />
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
