
import Header from '../components/Header';
import LeftSidebar from '../components/LeftSidebar';
import Canvas from '../components/Canvas';
import BottomStatusBar from '../components/BottomStatusBar';
import { ReactFlowProvider } from 'reactflow';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import 'reactflow/dist/style.css';
import StoryboardPage from './Storyboard';
import ShotEditor from './ShotEditor'; 

interface IndexProps {
  viewMode?: 'studio' | 'storyboard' | 'editor';
}

const Index = ({ viewMode: initialViewMode }: IndexProps) => {
  const { projectId } = useParams<{ projectId?: string }>();
  const [viewMode, setViewMode] = useState<'studio' | 'storyboard' | 'editor'>(initialViewMode || 'storyboard');
  
  // Log the projectId to help with debugging
  useEffect(() => {
    if (projectId) {
      console.log(`Index: Loaded with projectId: ${projectId}`);
    }
  }, [projectId]);

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
          <StoryboardPage 
            viewMode={viewMode} 
            setViewMode={setViewMode} 
          />
        )}
        
        {viewMode === 'editor' && (
          <ShotEditor 
            viewMode={viewMode} 
            setViewMode={setViewMode} 
          />
        )}
        
        <BottomStatusBar />
      </div>
    </ReactFlowProvider>
  );
};

export default Index;
