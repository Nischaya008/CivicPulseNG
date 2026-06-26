import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon, MapPin, ShieldCheck, AlertTriangle,
  ArrowUpRight, Clock,
} from 'lucide-react';
import { useUserLocation } from '../lib/useUserLocation';

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  status: string;
  category: string;
  severity: string;
  reporter_id: string;
  address: string;
  created_at: any;
}

const EVENT_TYPE_STYLES: Record<string, { icon: any; color: string; label: string; bg: string; border: string }> = {
  Reported: { icon: MapPin, color: 'text-[#546B41]', bg: 'bg-[#546B41]/10', border: 'border-[#546B41]/30', label: 'New Report' },
  'AI Verified': { icon: AlertTriangle, color: 'text-[#8B6F4E]', bg: 'bg-[#8B6F4E]/10', border: 'border-[#8B6F4E]/30', label: 'AI Verified' },
  'Community Verified': { icon: ShieldCheck, color: 'text-[#99AD7A]', bg: 'bg-[#99AD7A]/10', border: 'border-[#99AD7A]/30', label: 'Community Verified' },
  'In Progress': { icon: ActivityIcon, color: 'text-[#D4A853]', bg: 'bg-[#D4A853]/10', border: 'border-[#D4A853]/30', label: 'In Progress' },
  Resolved: { icon: ShieldCheck, color: 'text-[#6B8E5A]', bg: 'bg-[#6B8E5A]/10', border: 'border-[#6B8E5A]/30', label: 'Resolved' },
  Closed: { icon: AlertTriangle, color: 'text-[#C17B3A]', bg: 'bg-[#C17B3A]/10', border: 'border-[#C17B3A]/30', label: 'Closed' },
};

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#dc2626',
  High: '#ea580c',
  Medium: '#d97706',
  Low: '#546B41',
};

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function Activity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const { location } = useUserLocation();

  // ─── Realtime Activity Feed ──────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'issues'),
      orderBy('created_at', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as ActivityEvent));
      setEvents(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredEvents = filterType === 'all'
    ? events
    : events.filter((e) => e.status === filterType);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#DCCCAC] border-t-[#546B41] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-[#546B41] flex items-center gap-3">
          <ActivityIcon className="text-[#99AD7A]" size={32} />
          Activity Feed
        </h1>
        <p className="text-[#546B41]/70 mt-2 font-medium flex items-center gap-1.5">
          <MapPin size={16} className="text-[#D4A853]" />
          {location ? `Real-time platform activity for ${location.city || location.district || 'your area'}` : 'Real-time platform activity'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 custom-scrollbar">
        {['all', 'Reported', 'Community Verified', 'In Progress', 'Resolved'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shadow-sm ${
              filterType === type
                ? 'bg-[#546B41] text-[#FFF8EC] border-[#546B41]'
                : 'bg-white text-[#546B41]/70 border-[#DCCCAC] hover:bg-[#FFF8EC]'
            }`}
          >
            {type === 'all' ? 'All Activity' : type}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-[#DCCCAC]">
          <ActivityIcon className="mx-auto text-[#DCCCAC] mb-3" size={48} />
          <h3 className="text-lg font-bold text-[#546B41] mb-1">No activity yet</h3>
          <p className="text-[#546B41]/60 text-sm font-medium">Activity will appear here as issues are reported and updated.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[1.3rem] top-4 bottom-4 w-[2px] bg-[#DCCCAC]/50" />

          <div className="space-y-4">
            {filteredEvents.map((event) => {
              const config = EVENT_TYPE_STYLES[event.status] || EVENT_TYPE_STYLES.Reported;
              const Icon = config.icon;
              const createdAt = event.created_at?.toDate?.() || new Date();
              const severityColor = SEVERITY_COLORS[event.severity || 'Medium'];

              return (
                <Link
                  key={event.id}
                  to={`/issue/${event.id}`}
                  className="relative flex items-start gap-4 p-4 rounded-2xl bg-white border border-[#DCCCAC] hover:bg-[#FFF8EC]/50 hover:shadow-md hover:border-[#DCCCAC] transition-all group"
                >
                  {/* Timeline dot */}
                  <div className={`w-10 h-10 rounded-xl ${config.bg} ${config.border} border flex items-center justify-center z-10 shrink-0 shadow-sm`}>
                    <Icon size={18} className={config.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${config.color}`}>
                            {config.label}
                          </span>
                          {event.severity && (
                            <span 
                              className="w-2 h-2 rounded-full shadow-sm" 
                              style={{ backgroundColor: severityColor }}
                              title={`${event.severity} Severity`}
                            />
                          )}
                        </div>
                        <h4 className="text-base font-bold text-[#546B41] line-clamp-1 group-hover:text-[#99AD7A] transition-colors leading-tight">
                          {event.title || 'Untitled Issue'}
                        </h4>
                      </div>
                      <ArrowUpRight size={16} className="text-[#DCCCAC] group-hover:text-[#546B41] shrink-0 mt-1 transition-colors" />
                    </div>
                    
                    <div className="flex items-center gap-3 mt-3 text-[11px] font-bold text-[#546B41]/50">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {timeAgo(createdAt)}
                      </span>
                      {event.category && (
                        <span className="px-2 py-0.5 bg-[#FFF8EC] border border-[#DCCCAC]/50 rounded-md text-[#546B41]">{event.category}</span>
                      )}
                      {event.address && (
                        <span className="flex items-center gap-1 truncate max-w-[200px] text-[#546B41]/70">
                          <MapPin size={12} />
                          {event.address}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
