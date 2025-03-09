
import Header from '../components/Header';
import LeftSidebar from '../components/LeftSidebar';
import Canvas from '../components/Canvas';
import BottomStatusBar from '../components/BottomStatusBar';
import { ReactFlowProvider } from 'reactflow';
import { useState } from 'react';
import 'reactflow/dist/style.css';
import StoryboardPage from './Storyboard';
import ShotEditor from './ShotEditor'; 

const Index = () => {
  const [viewMode, setViewMode] = useState<'studio' | 'storyboard' | 'editor'>('storyboard');

  return (
    <ReactFlowProvider>
      <div className="w-screen h-screen bg-[#0F1117] flex flex-col">
        <Header viewMode={viewMode} setViewMode={setViewMode} />
        
        {viewMode === 'studio' && (
          <div className="flex flex-1 h-[calc(100vh-4rem-1.5rem)]">
            <LeftSidebar />
            <Canvas />
          </div>
        )}
        
        {viewMode === 'storyboard' && (
          <StoryboardPage />
        )}
        
        {viewMode === 'editor' && (
          <ShotEditor />
        )}
        
        <BottomStatusBar />
      </div>
    </ReactFlowProvider>
  );
};

export default Index;
