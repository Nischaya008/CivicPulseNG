import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface RealtimeContextType {
  unreadCount: number;
  latestIssues: any[];
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextType>({
  unreadCount: 0,
  latestIssues: [],
  isConnected: false,
});

export const useRealtime = () => useContext(RealtimeContext);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestIssues, setLatestIssues] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const isFirstLoadRef = useRef(true);
  const prevIssueCountRef = useRef(0);

  // ─── Realtime Notifications Subscription ─────────────────
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      where('read', '==', false),
      limit(50) // orderBy removed to avoid composite index requirement
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setUnreadCount(snapshot.size);
        setIsConnected(true);

        // Show toast for new notifications (skip initial load)
        if (!isFirstLoadRef.current) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              addToast({
                type: 'info',
                title: data.title || 'New Notification',
                message: data.message,
                duration: 6000,
              });
            }
          });
        }
        isFirstLoadRef.current = false;
      },
      (error) => {
        console.error('Notification subscription error:', error);
        setIsConnected(false);
      }
    );

    return () => {
      unsubscribe();
      isFirstLoadRef.current = true;
    };
  }, [user, addToast]);

  // ─── Realtime Issues Subscription (for feed live updates) ──
  useEffect(() => {
    const q = query(
      collection(db, 'issues'),
      orderBy('created_at', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const issues = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        
        // Show toast when new issues appear (not on first load)
        if (prevIssueCountRef.current > 0 && issues.length > prevIssueCountRef.current) {
          const newIssue = issues[0];
          addToast({
            type: 'info',
            title: '🆕 New Issue Reported',
            message: (newIssue as any).title || 'A new civic issue has been reported nearby',
            duration: 5000,
          });
        }
        prevIssueCountRef.current = issues.length;

        setLatestIssues(issues);
      },
      (error) => {
        console.error('Issues subscription error:', error);
      }
    );

    return () => unsubscribe();
  }, [addToast]);

  return (
    <RealtimeContext.Provider value={{ unreadCount, latestIssues, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
};
