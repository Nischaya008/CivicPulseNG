import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LogOut, Award, Star, Edit2, Shield, TrendingUp, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function Profile() {
  const { user, logout } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
  const [gamification, setGamification] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      
      // Fetch user doc
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfileData(docSnap.data());
      }

      // Fetch gamification stats
      try {
        const res = await fetch(`${BACKEND_URL}/api/gamification/user/${user.uid}`);
        if (res.ok) {
          const stats = await res.json();
          setGamification(stats);
        }
      } catch (err) {
        console.error('Failed to fetch gamification stats:', err);
      }
    }
    fetchData();
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const trustScore = profileData?.trust_score || 50;
  const trustColor = trustScore >= 80 ? 'text-[#546B41]' : trustScore >= 50 ? 'text-[#D4A853]' : 'text-amber-600';

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 pb-24">
      {/* Profile Header Card */}
      <div className="bg-white shadow-sm rounded-2xl overflow-hidden border-2 border-[#DCCCAC]">
        <div className="h-32 bg-gradient-to-r from-[#DCCCAC] via-[#99AD7A] to-[#546B41] relative" />
        <div className="px-6 pb-6 -mt-16 relative">
          <img
            src={user?.photoURL || 'https://ui-avatars.com/api/?name=' + user?.displayName}
            alt="Avatar"
            className="w-28 h-28 rounded-2xl border-4 border-white shadow-lg object-cover bg-white"
          />
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#546B41]">{user?.displayName}</h1>
              <p className="text-sm font-medium text-[#546B41]/70">{user?.email}</p>
            </div>
            {gamification?.level && (
              <div className="sm:text-right">
                <span className="text-xs font-bold text-[#D4A853] uppercase tracking-widest">Level {gamification.level.level}</span>
                <p className="text-base font-bold text-[#546B41]">{gamification.level.title}</p>
              </div>
            )}
          </div>

          {/* Level Progress */}
          {gamification?.level && gamification.level.nextLevelPoints && (
            <div className="mt-8">
              <div className="flex justify-between text-xs font-bold text-[#546B41]/60 mb-2 uppercase tracking-wider">
                <span>{gamification.points} pts</span>
                <span>{gamification.level.nextLevelPoints} pts for Level {gamification.level.level + 1}</span>
              </div>
              <div className="h-3 bg-[#FFF8EC] border border-[#DCCCAC]/50 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-[#546B41] rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${gamification.level.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-[#DCCCAC]/40">
            <div className="bg-[#FFF8EC] rounded-xl p-4 text-center border border-[#DCCCAC]">
              <Trophy size={20} className="mx-auto mb-2 text-[#D4A853]" />
              <p className="text-2xl font-black text-[#546B41]">{gamification?.points || 0}</p>
              <p className="text-[10px] text-[#546B41]/60 font-bold uppercase tracking-widest">Points</p>
            </div>
            <div className="bg-[#FFF8EC] rounded-xl p-4 text-center border border-[#DCCCAC]">
              <Star size={20} className={`mx-auto mb-2 ${trustColor}`} />
              <p className={`text-2xl font-black ${trustColor}`}>{trustScore}</p>
              <p className="text-[10px] text-[#546B41]/60 font-bold uppercase tracking-widest">Trust</p>
            </div>
            <div className="bg-[#FFF8EC] rounded-xl p-4 text-center border border-[#DCCCAC]">
              <TrendingUp size={20} className="mx-auto mb-2 text-[#99AD7A]" />
              <p className="text-2xl font-black text-[#546B41]">{profileData?.verification_stats?.total_reports || 0}</p>
              <p className="text-[10px] text-[#546B41]/60 font-bold uppercase tracking-widest">Reports</p>
            </div>
            <div className="bg-[#FFF8EC] rounded-xl p-4 text-center border border-[#DCCCAC]">
              <Shield size={20} className="mx-auto mb-2 text-[#C17B3A]" />
              <p className="text-2xl font-black text-[#546B41]">{profileData?.verification_stats?.total_votes || 0}</p>
              <p className="text-[10px] text-[#546B41]/60 font-bold uppercase tracking-widest">Verifies</p>
            </div>
          </div>
        </div>
      </div>

      {/* Badges Section */}
      {gamification?.badges && gamification.badges.length > 0 && (
        <div className="bg-white shadow-sm rounded-2xl p-6 border border-[#DCCCAC]">
          <h2 className="text-sm font-bold text-[#546B41] uppercase tracking-widest mb-6 flex items-center gap-2">
            <Award size={18} className="text-[#D4A853]" /> Earned Badges
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {gamification.badges.map((badge: any) => (
              <div key={badge.id} className="flex items-center gap-4 bg-[#FFF8EC]/50 hover:bg-[#FFF8EC] transition-colors p-4 rounded-xl border border-[#DCCCAC]/50 shadow-sm">
                <div className="text-4xl drop-shadow-sm">{badge.icon}</div>
                <div>
                  <h3 className="font-bold text-[#546B41] text-base leading-tight mb-1">{badge.name}</h3>
                  <p className="text-xs font-medium text-[#546B41]/70">{badge.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white shadow-sm rounded-2xl p-5 border border-[#DCCCAC] space-y-3">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-xl hover:bg-[#FFF8EC] transition-colors text-sm font-bold text-[#546B41] border border-transparent hover:border-[#DCCCAC]/50"
        >
          <Edit2 size={18} className="text-[#99AD7A]" />
          Edit Profile & Settings
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-xl hover:bg-red-50 transition-colors text-sm font-bold text-red-600 border border-transparent hover:border-red-100"
        >
          <LogOut size={18} />
          Log Out
        </button>
      </div>
    </div>
  );
}
