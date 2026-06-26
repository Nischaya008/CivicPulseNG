import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, PlusCircle, User, Shield, Bell, BarChart3, Activity, Award, Trophy, Brain, LogIn, LogOut } from 'lucide-react';
import { useRealtime } from '../contexts/RealtimeContext';
import { useAuth } from '../contexts/AuthContext';

export function Sidebar({ onLoginClick }: { onLoginClick: () => void }) {
  const location = useLocation();
  const { unreadCount } = useRealtime();
  const { user, logout } = useAuth();

  const sidebarItems = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    ...(user ? [
      { path: '/predictions', icon: Brain, label: 'Predictions' },
      { path: '/activity', icon: Activity, label: 'Activity' },
      { path: '/notifications', icon: Bell, label: 'Notifications', badge: unreadCount },
      { path: '/profile', icon: User, label: 'Profile' },
      { path: '/settings', icon: Award, label: 'Settings' },
    ] : []),
  ];

  return (
    <aside className="w-full h-full bg-[#FFF8EC] border border-[#DCCCAC] panel flex flex-col">
      <div className="h-24 flex justify-center items-center px-4 border-b border-[#DCCCAC] shrink-0 overflow-hidden">
        <img src="/Banner.png" alt="CivicPulse Banner" className="w-full h-auto object-contain scale-[0.9] origin-center" />
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto custom-scrollbar">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${active
                ? 'bg-[#546B41] text-[#FFF8EC] shadow-sm'
                : 'text-[#546B41]/70 hover:bg-[#DCCCAC]/30 hover:text-[#546B41]'
                }`}
            >
              <Icon size={20} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="w-5 h-5 bg-[#546B41] text-[#FFF8EC] text-[10px] rounded-full flex items-center justify-center font-bold shadow-sm">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}

        {!user ? (
          <button
            onClick={onLoginClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold bg-[#99AD7A]/20 text-[#546B41] hover:bg-[#99AD7A]/40 mt-auto shrink-0"
          >
            <LogIn size={20} />
            <span className="flex-1 text-left">Login</span>
          </button>
        ) : (
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold text-[#546B41] bg-[#DCCCAC]/20 hover:bg-[#DCCCAC]/40 mt-auto shrink-0"
          >
            <LogOut size={20} />
            <span className="flex-1 text-left">Logout</span>
          </button>
        )}
      </nav>

      <div className="p-3 border-t border-[#DCCCAC] shrink-0">
        <div className="bg-[#DCCCAC]/20 rounded-xl p-3 text-center border border-[#DCCCAC]/50">
          <p className="text-xs font-bold text-[#546B41]">Powered by Google AI Studio</p>
          <p className="text-[10px] text-[#546B41]/70 mt-0.5 font-medium">GDG | Vibe2Ship | CN</p>
        </div>
      </div>
    </aside>
  );
}

export function MobileBottomNav({ onLoginClick }: { onLoginClick: () => void }) {
  const location = useLocation();
  const { user } = useAuth();

  const navItems = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/issue/new', icon: PlusCircle, label: 'Report' },
    { path: '/predictions', icon: Brain, label: 'Predict' },
    { path: '/leaderboard', icon: Trophy, label: 'Leaders' },
  ];

  const protectedRoutes = ['/issue/new', '/predictions'];

  return (
    <nav className="w-full h-full bg-[#FFF8EC]/95 backdrop-blur-xl flex justify-between items-center px-4 shadow-[0_-8px_30px_rgba(84,107,65,0.1)] rounded-[2.5rem] border border-[#DCCCAC] overflow-visible">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = location.pathname === item.path;
        const isReport = item.path === '/issue/new';
        const isProtected = protectedRoutes.includes(item.path);

        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={(e) => {
              if (isProtected && !user) {
                e.preventDefault();
                onLoginClick();
              }
            }}
            className={`flex flex-col items-center justify-center relative transition-all ${isReport ? 'w-16 h-16 -mt-8' : 'w-14 h-full'
              } ${isReport
                ? ''
                : active
                  ? 'text-[#546B41]'
                  : 'text-[#546B41]/50 hover:text-[#546B41]/80'
              }`}
          >
            {isReport ? (
              <div className="w-14 h-14 rounded-full bg-[#546B41] flex items-center justify-center shadow-xl border-4 border-[#FFF8EC] absolute -top-4 hover:scale-110 transition-transform">
                <PlusCircle size={28} className="text-[#FFF8EC]" />
              </div>
            ) : (
              <>
                <Icon size={22} className={active ? "fill-[#546B41]/10" : ""} />
                <span className={`text-[9px] mt-1 font-bold ${active ? 'text-[#546B41]' : ''}`}>{item.label}</span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
