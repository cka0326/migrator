import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { Header } from './components/Header';
import { DetailsPanel } from './components/DetailsPanel';
import { ColumnEditorPanel } from './components/ColumnEditorPanel';
import { LineageGraph } from './components/canvas/LineageGraph';

function App() {
  const loadNodes = useStore(state => state.loadNodes);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 overflow-hidden text-left">
      <Header />
      <div className="flex-1 relative">
        <LineageGraph />
      </div>
      <ColumnEditorPanel />
      <DetailsPanel />
    </div>
  );
}

export default App;
