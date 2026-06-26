import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Award, TrendingUp, Star, Shield, MapPin, Target, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserLocation } from '../lib/useUserLocation';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface LeaderboardUser {
  rank: number;
  user_id: string;
  name: string;
  avatar: string | null;
  points: number;
  trust_score: number;
  reports_count?: number;
  verifications_count?: number;
}

const LEVELS = [
  { level: 1, minPoints: 0, title: 'Novice Reporter' },
  { level: 2, minPoints: 50, title: 'Active Citizen' },
  { level: 3, minPoints: 150, title: 'Civic Leader' },
  { level: 4, minPoints: 300, title: 'Neighborhood Watch' },
  { level: 5, minPoints: 600, title: 'City Guardian' },
  { level: 6, minPoints: 1000, title: 'Pulse Master' },
];

function getLevel(points: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (points >= l.minPoints) current = l;
    else break;
  }
  return current;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const { location, loading: locLoading } = useUserLocation();
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (locLoading) return;
    const locQuery = location ? `&lat=${location.lat}&lng=${location.lng}&radius_km=10` : '';
    fetch(`${BACKEND_URL}/api/analytics/leaderboard?limit=20${locQuery}`)
      .then(res => res.json())
      .then(data => setLeaderboard(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [location, locLoading]);

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const myRank = leaderboard.find(u => u.user_id === user?.uid);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
      {/* ─── Header ─── */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-[#546B41] flex items-center gap-3">
          <Trophy className="text-[#D4A853]" size={32} />
          Community Leaderboard
        </h1>
        <p className="text-[#546B41]/70 mt-2 flex items-center gap-1.5 font-medium">
          <MapPin size={16} className="text-[#99AD7A]" />
          {location ? `Top contributors making ${location.city || location.district || 'your area'} better.` : 'Top contributors making our city better, one report at a time.'}
        </p>
      </div>

      {/* ─── My Stats (If Logged In) ─── */}
      {user && myRank && (
        <div className="mb-10 bg-white rounded-2xl p-5 border-2 border-[#DCCCAC] shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-[#DCCCAC] overflow-hidden p-0.5">
              <img src={myRank.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myRank.user_id}`} alt="avatar" referrerPolicy="no-referrer" className="w-full h-full rounded-full" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#546B41]/60 uppercase tracking-widest">My Rank</p>
              <h3 className="text-xl font-black text-[#546B41]">#{myRank.rank}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-[#546B41]/60 uppercase tracking-widest">Points</p>
            <div className="flex items-center gap-1 text-lg font-bold text-[#D4A853]">
              <Star size={16} className="fill-[#D4A853]" /> {myRank.points}
            </div>
          </div>
        </div>
      )}

      {/* ─── Top 3 Podium ─── */}
      <div className="grid grid-cols-3 gap-2 md:gap-6 mb-12 items-end">
        {[1, 0, 2].map((podiumIndex) => {
          const u = top3[podiumIndex];
          if (!u) return <div key={podiumIndex} className="hidden md:block" />;
          
          const isFirst = podiumIndex === 0;
          const userLevel = getLevel(u.points);
          
          const podiumColor = isFirst ? '#D4A853' : podiumIndex === 1 ? '#94A3B8' : '#C17B3A';
          const podiumBg = isFirst ? '#FFF8EC' : '#ffffff';
          const borderClass = isFirst ? 'border-2 border-[#D4A853] shadow-lg shadow-[#D4A853]/20 md:-mt-6 z-10' : 'border border-[#DCCCAC] shadow-sm';
          const heightClass = isFirst ? 'h-[105%]' : 'h-full';

          return (
            <div 
              key={u.user_id} 
              className={`flex flex-col items-center justify-between rounded-xl md:rounded-2xl p-2 md:p-6 relative ${borderClass} ${heightClass}`}
              style={{ backgroundColor: podiumBg }}
            >
              {/* Rank Badge */}
              <div 
                className="absolute -top-3 md:-top-4 w-6 h-6 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-black text-xs md:text-base shadow-md border-2 border-white"
                style={{ backgroundColor: podiumColor }}
              >
                {u.rank}
              </div>
              
              {/* Avatar */}
              <div 
                className="w-12 h-12 md:w-24 md:h-24 rounded-full p-0.5 md:p-1 border-2 md:border-4 mb-2 md:mb-4 bg-white mt-3 md:mt-0"
                style={{ borderColor: podiumColor }}
              >
                <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.user_id}`} alt="avatar" referrerPolicy="no-referrer" className="w-full h-full rounded-full" />
              </div>
              
              <h3 className="font-bold text-[10px] md:text-lg text-[#546B41] truncate w-full text-center">{u.name.split(' ')[0]}</h3>
              <p className="text-[8px] md:text-[10px] font-bold text-[#99AD7A] mb-1.5 md:mb-3 uppercase tracking-widest truncate w-full text-center hidden md:block">Lv. {userLevel.level} {userLevel.title}</p>
              
              <div className="flex items-center justify-center gap-0.5 md:gap-1.5 text-[#546B41] bg-[#546B41]/5 border border-[#546B41]/10 px-1.5 md:px-4 py-1 md:py-2 rounded-full font-bold text-[9px] md:text-base w-full overflow-hidden whitespace-nowrap">
                <Star size={12} className="text-[#D4A853] fill-[#D4A853] shrink-0" />
                <span className="truncate">{u.points} <span className="hidden md:inline">pts</span></span>
              </div>
              
              {/* Extra Stats */}
              <div className="mt-2 md:mt-4 flex flex-col xl:flex-row items-center gap-1 md:gap-4 text-[8px] md:text-xs font-medium text-[#546B41]/70 w-full justify-center border-t border-[#DCCCAC]/30 pt-2 md:pt-4">
                <div className="flex flex-col items-center">
                  <span className="font-bold text-[#546B41]">{u.reports_count || Math.floor(u.points/20)}</span>
                  <span className="text-[7px] md:text-[9px] uppercase tracking-wider hidden md:block">Reports</span>
                </div>
                <div className="flex flex-col items-center border-t xl:border-t-0 xl:border-l border-[#DCCCAC]/50 pt-1 xl:pt-0 xl:pl-4 w-full xl:w-auto mt-1 xl:mt-0 md:border-l md:border-t-0 md:pl-4 md:mt-0 md:pt-0">
                  <span className="font-bold text-[#546B41]">{u.trust_score}%</span>
                  <span className="text-[7px] md:text-[9px] uppercase tracking-wider hidden md:block">Trust</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-[#DCCCAC]/60 mb-8" />

      {/* ─── Rankings Table ─── */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC] overflow-hidden">
        <div className="p-5 border-b border-[#DCCCAC] bg-[#FFF8EC] flex justify-between items-center">
          <h2 className="font-extrabold text-[#546B41]">Rankings</h2>
          <div className="text-xs font-bold text-[#546B41]/60 uppercase tracking-widest flex items-center gap-4">
            <span className="flex items-center gap-1"><Award size={14}/> Badges</span>
            <span className="flex items-center gap-1"><TrendingUp size={14}/> Points</span>
          </div>
        </div>

        <div className="divide-y divide-[#DCCCAC]/40">
          {rest.map((u) => {
            const isMe = u.user_id === user?.uid;
            const userLevel = getLevel(u.points);
            
            return (
              <div key={u.user_id} className={`p-4 flex items-center gap-4 transition-colors hover:bg-[#FFF8EC]/50 ${isMe ? 'bg-[#546B41]/5' : ''}`}>
                <div className="w-8 text-center font-black text-[#546B41]/40">
                  {u.rank}
                </div>
                <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.user_id}`} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full border border-[#DCCCAC]" alt="Avatar" />
                
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#546B41] flex items-center gap-2 truncate">
                    {u.name} {isMe && <span className="text-[10px] bg-[#546B41] text-[#FFF8EC] px-2 py-0.5 rounded-full uppercase tracking-widest">You</span>}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#99AD7A] truncate">Lv. {userLevel.level} · {userLevel.title}</p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="hidden sm:flex items-center gap-1.5">
                    {u.points > 500 && <Medal size={18} className="text-[#D4A853]" />}
                    {u.trust_score > 80 && <Shield size={18} className="text-[#546B41]" />}
                    {u.rank <= 10 && <Target size={18} className="text-[#C17B3A]" />}
                  </div>
                  <div className="font-black text-[#546B41] w-20 text-right flex items-center justify-end gap-1">
                    {u.points}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="p-8 text-center text-[#546B41]/50 font-medium">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-[#546B41]" />
              Loading rankings...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
