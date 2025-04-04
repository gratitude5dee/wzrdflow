
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ViewModeSelector } from '@/components/home/ViewModeSelector';
import CreditsDisplay from '@/components/CreditsDisplay';
import { Logo } from '@/components/ui/logo';

interface HeaderProps {
  viewMode: 'studio' | 'storyboard' | 'editor';
  setViewMode: (mode: 'studio' | 'storyboard' | 'editor') => void;
}

const Header = ({ viewMode, setViewMode }: HeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/login');
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleBack = () => {
    navigate('/home');
  };

  return (
    <header className="w-full glass-panel px-6 py-3 shadow-lg z-30 border-b">
      <div className="flex justify-between items-center">
        <div className="flex items-center cursor-pointer" onClick={() => navigate('/home')}>
          <Logo />
        </div>
        
        <ViewModeSelector viewMode={viewMode} setViewMode={setViewMode} />

        <div className="flex items-center gap-3">
          <CreditsDisplay showButton={true} />
          <Button 
            variant="ghost" 
            className="bg-[#1D2130] hover:bg-[#262B3D] text-white transition-all-std glow-button-subtle"
            onClick={handleBack}
          >
            Back to Projects
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
