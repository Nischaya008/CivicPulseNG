import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sidebar, MobileBottomNav } from './NavigationComponents';
import LoginModal from './LoginModal';
import { Plus } from 'lucide-react';
import Marquee from './Marquee';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  return (
    <div className="app-container">
      <div className="grid-bg"></div>

      {/* ─── Marquee ─── */}
      <div className="grid-marquee">
        <Marquee />
      </div>

      {/* ─── Sidebar & Bottom Nav ─── */}
      <div className="grid-sidebar">
        <div className="hidden lg:block h-full">
          <Sidebar onLoginClick={() => setIsLoginModalOpen(true)} />
        </div>
        <div className="lg:hidden h-full w-full">
          <MobileBottomNav onLoginClick={() => setIsLoginModalOpen(true)} />
        </div>
      </div>

      {/* ─── Main Content (Projected via Outlet) ─── */}
      {location.pathname === '/' ? (
        <Outlet context={{ setIsLoginModalOpen }} />
      ) : (
        <div className="grid-page panel bg-[var(--color-bg)] border border-[#DCCCAC] overflow-y-auto custom-scrollbar">
          <Outlet context={{ setIsLoginModalOpen }} />
        </div>
      )}

      {/* ─── Footer Section ─── */}
      <div className="grid-footer panel bg-[#FFF8EC] border border-[#DCCCAC] hidden lg:flex items-center justify-between px-6 text-[#546B41] font-bold text-[10px] uppercase tracking-wider">
        <a href="https://www.linkedin.com/in/nischaya008/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#99AD7A] transition-colors" style={{textDecorationColor: 'inherit'}}>Built by Nischaya Garg</a>
        <div className="flex gap-6">
          <a href="#" className="hover:text-[#99AD7A] transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-[#99AD7A] transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-[#99AD7A] transition-colors">Contact Support</a>
        </div>
      </div>

      {/* ─── Floating Report Issue Button (Desktop) ─── */}
      <div className="fixed bottom-12 right-12 z-50 hidden lg:flex">
        <Link
          to="/issue/new"
          onClick={(e) => {
            if (!user) {
              e.preventDefault();
              setIsLoginModalOpen(true);
            }
          }}
          className="w-16 h-16 bg-[#546B41] rounded-full flex items-center justify-center text-[#FFF8EC] shadow-[0_8px_30px_rgba(84,107,65,0.4)] hover:scale-110 transition-transform border-4 border-[#FFF8EC]"
          title="Report Issue"
        >
          <Plus size={32} />
        </Link>
      </div>

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </div>
  );
}
