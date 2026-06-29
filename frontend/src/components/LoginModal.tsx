import React, { useEffect } from 'react';
import { X, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && isOpen) {
      onClose();
    }
  }, [user, isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      onClose();
      navigate('/');
    } catch (error) {
      console.error('Failed to log in:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg p-1 bg-gradient-to-b from-[#DCCCAC] to-transparent rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="relative bg-[#FFF8EC] rounded-[1.8rem] overflow-hidden flex flex-col">
          
          {/* Header Graphic Area */}
          <div className="bg-gradient-to-br from-[#546B41] to-[#3A4D2D] p-8 pb-10 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/20 rounded-full transition-all"
            >
              <X size={20} />
            </button>
            <div className="mx-auto w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20 backdrop-blur-sm shadow-inner">
              <MapPin size={24} className="text-white" />
            </div>
            <h2 className="text-3xl font-black text-[#FFF8EC] tracking-tight uppercase leading-tight mb-2">
              CivicPulse AI
            </h2>
            <p className="text-sm text-[#DCCCAC] font-medium tracking-widest uppercase">
              An AI-Powered Community Operating System
            </p>
          </div>

          <div className="p-8 -mt-6 bg-[#FFF8EC] rounded-t-3xl relative z-10 flex flex-col items-center">
            
            {/* Tagline section */}
            <div className="flex items-center gap-4 text-[#546B41] font-black text-xs uppercase tracking-[0.2em] mb-6 w-full">
              <div className="h-px bg-[#DCCCAC] flex-1"></div>
              <span>Report ♦ Verify ♦ Resolve</span>
              <div className="h-px bg-[#DCCCAC] flex-1"></div>
            </div>

            <p className="text-sm text-[#546B41]/70 font-medium text-center mb-8 px-4 leading-relaxed">
              Join the hyperlocal civic intelligence platform. Upload evidence, let AI understand the issue, and help prioritize what matters in your neighborhood.
            </p>

            <button
              onClick={handleGoogleLogin}
              className="cursor-pointer w-full relative group overflow-hidden rounded-2xl bg-white border-2 border-[#DCCCAC] shadow-[0_4px_14px_0_rgba(220,204,172,0.39)] hover:shadow-[0_6px_20px_rgba(84,107,65,0.23)] hover:border-[#546B41] transition-all duration-300"
            >
              <div className="absolute inset-0 w-3 bg-[#546B41] transition-all duration-[250ms] ease-out group-hover:w-full"></div>
              <div className="relative flex items-center justify-center gap-3 px-6 py-4">
                <svg className="w-5 h-5 text-[#546B41] group-hover:text-[#FFF8EC] transition-colors duration-300" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="font-bold text-[#546B41] group-hover:text-[#FFF8EC] transition-colors duration-300">
                  Continue with Google
                </span>
              </div>
            </button>

            <p className="text-[10px] text-center text-[#546B41]/50 mt-6 font-medium uppercase tracking-wider">
              By joining, you agree to our{' '}
              <a href="#" className="underline hover:text-[#546B41] transition-colors">Terms</a> and{' '}
              <a href="#" className="underline hover:text-[#546B41] transition-colors">Privacy</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
