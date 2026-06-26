import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Link } from 'react-router-dom';
import {
  Bell, BellOff, CheckCheck, AlertTriangle, MapPin, MessageSquare,
  ShieldCheck, Award, Sparkles, Clock, Loader2,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const NOTIFICATION_ICONS: Record<string, any> = {
  issue_created: { icon: MapPin, color: 'text-[#546B41]', bg: 'bg-[#546B41]/10', border: 'border-[#546B41]/30' },
  issue_verified: { icon: ShieldCheck, color: 'text-[#99AD7A]', bg: 'bg-[#99AD7A]/10', border: 'border-[#99AD7A]/30' },
  issue_status_changed: { icon: AlertTriangle, color: 'text-[#D4A853]', bg: 'bg-[#D4A853]/10', border: 'border-[#D4A853]/30' },
  comment_added: { icon: MessageSquare, color: 'text-[#8B6F4E]', bg: 'bg-[#8B6F4E]/10', border: 'border-[#8B6F4E]/30' },
  verification_request: { icon: ShieldCheck, color: 'text-[#C17B3A]', bg: 'bg-[#C17B3A]/10', border: 'border-[#C17B3A]/30' },
  badge_earned: { icon: Award, color: 'text-[#D4A853]', bg: 'bg-[#D4A853]/10', border: 'border-[#D4A853]/30' },
  points_earned: { icon: Sparkles, color: 'text-[#546B41]', bg: 'bg-[#546B41]/10', border: 'border-[#546B41]/30' },
  duplicate_detected: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
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

export default function Notifications() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  // ─── Realtime Notifications ─────────────────────────────
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.() || new Date(),
      }));
      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // ─── Mark single as read ─────────────────────────────────
  const markAsRead = async (notifId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/notifications/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [notifId] }),
      });
    } catch (err) {
      // Fallback: update directly
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    }
  };

  // ─── Mark all as read ─────────────────────────────────────
  const markAllAsRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    try {
      await fetch(`${BACKEND_URL}/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.uid }),
      });
      addToast({ type: 'success', title: 'All marked as read' });
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to mark all as read' });
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-[#546B41] flex items-center gap-3">
            <Bell className="text-[#D4A853]" size={32} />
            Notifications
          </h1>
          <p className="text-[#546B41]/70 mt-2 font-medium">
            {unreadCount > 0 ? `You have ${unreadCount} unread updates` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={markingAll}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-white text-[#546B41] rounded-xl hover:bg-[#FFF8EC] border border-[#DCCCAC] shadow-sm transition-colors disabled:opacity-50"
          >
            {markingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
            Mark all read
          </button>
        )}
      </div>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-[#DCCCAC]">
          <BellOff className="mx-auto text-[#DCCCAC] mb-3" size={48} />
          <h3 className="text-lg font-bold text-[#546B41] mb-1">No notifications yet</h3>
          <p className="text-[#546B41]/60 text-sm font-medium">
            You'll receive notifications when issues are reported, verified, or updated near you.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC] overflow-hidden divide-y divide-[#DCCCAC]/40">
          {notifications.map((notif) => {
            const config = NOTIFICATION_ICONS[notif.type] || NOTIFICATION_ICONS.issue_created;
            const Icon = config.icon;

            return (
              <div
                key={notif.id}
                className={`flex items-start gap-4 p-5 transition-colors cursor-pointer hover:bg-[#FFF8EC]/50 ${
                  !notif.read ? 'bg-[#546B41]/5' : ''
                }`}
                onClick={() => {
                  if (!notif.read) markAsRead(notif.id);
                }}
              >
                <div className={`w-12 h-12 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon size={20} className={config.color} />
                </div>
                
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-base leading-tight mb-1 ${!notif.read ? 'font-bold text-[#546B41]' : 'font-medium text-[#546B41]/80'}`}>
                      {notif.title}
                    </p>
                    {!notif.read && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#546B41] shrink-0 mt-1 shadow-sm" />
                    )}
                  </div>
                  
                  {notif.message && (
                    <p className="text-sm text-[#546B41]/70 mt-1 line-clamp-2 leading-snug">{notif.message}</p>
                  )}
                  
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-xs font-bold text-[#546B41]/50 flex items-center gap-1.5 uppercase tracking-widest">
                      <Clock size={12} />
                      {timeAgo(notif.created_at)}
                    </span>
                    {notif.issue_id && (
                      <Link
                        to={`/issue/${notif.issue_id}`}
                        className="text-xs font-bold text-[#99AD7A] hover:text-[#546B41] transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        VIEW DETAILS →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
