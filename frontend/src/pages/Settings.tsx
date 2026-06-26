import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Globe, Palette, ChevronRight, Shield } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const settingsGroups = [
    {
      title: 'Preferences',
      items: [
        { icon: Bell, label: 'Notifications', desc: 'Push & email notifications' },
        { icon: Globe, label: 'Language', desc: 'English' },
        { icon: Palette, label: 'Theme', desc: 'System default' },
      ],
    },
    {
      title: 'Privacy & Security',
      items: [
        { icon: Shield, label: 'Anonymous Reporting', desc: 'Report without revealing identity' },
      ],
    },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
      <h1 className="text-3xl font-extrabold text-[#546B41] mb-8">Settings</h1>

      {settingsGroups.map((group) => (
        <div key={group.title} className="mb-8">
          <h2 className="text-xs font-bold text-[#546B41]/50 uppercase tracking-widest mb-3 px-2">{group.title}</h2>
          <div className="bg-white shadow-sm rounded-2xl border border-[#DCCCAC] overflow-hidden divide-y divide-[#DCCCAC]/40">
            {group.items.map(({ icon: Icon, label, desc }) => (
              <button
                key={label}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#FFF8EC]/50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-[#546B41]/5 rounded-xl flex items-center justify-center shrink-0 border border-[#546B41]/10">
                  <Icon size={20} className="text-[#546B41]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-[#546B41]">{label}</p>
                  <p className="text-sm font-medium text-[#546B41]/70">{desc}</p>
                </div>
                <ChevronRight size={20} className="text-[#DCCCAC] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className="text-center text-xs font-medium text-[#546B41]/40 mt-10">CivicPulse AI v0.1.0 · Powered by Gemini</p>
    </div>
  );
}
