import React, { useEffect, useState } from 'react';
import { collection, query, limit, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useUserLocation } from '../lib/useUserLocation';

export default function Marquee() {
  const { location } = useUserLocation();
  const [headlines, setHeadlines] = useState([
    'WELCOME TO CIVICPULSE',
    'REPORT LOCAL ISSUES INSTANTLY',
    'AI-POWERED VERIFICATION',
    "SHAPE YOUR CITY'S FUTURE"
  ]);

  useEffect(() => {
    async function fetchTopIssues() {
      try {
        const q = query(
          collection(db, 'issues'),
          orderBy('created_at', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const issues = snapshot.docs.map(doc => doc.data());
        
        let relevantIssues = issues.filter(issue => issue.severity === 'Critical' || issue.severity === 'High');

        // If location is available, try to filter issues nearby (simple bounding box or just string match if lat/lng is missing)
        if (location && location.lat && location.lng) {
          const nearbyIssues = issues.filter(issue => {
            if (!issue.lat || !issue.lng) return false;
            // Simple distance calculation (Pythagorean for small distances)
            const dLat = issue.lat - location.lat;
            const dLng = issue.lng - location.lng;
            const dist = Math.sqrt(dLat * dLat + dLng * dLng);
            return dist < 0.1; // roughly 10km
          });
          if (nearbyIssues.length > 0) {
            relevantIssues = nearbyIssues;
          }
        }

        relevantIssues = relevantIssues.slice(0, 8);
        
        if (relevantIssues.length > 0) {
          const formatted = relevantIssues.map(issue => `[${issue.severity.toUpperCase()}] ${issue.title || issue.category}`);
          
          if (formatted.length < 4) {
            const defaultHeadlines = [
              'WELCOME TO CIVICPULSE',
              'REPORT LOCAL ISSUES INSTANTLY',
              'AI-POWERED VERIFICATION',
              "SHAPE YOUR CITY'S FUTURE"
            ];
            setHeadlines([...formatted, ...defaultHeadlines].slice(0, 8));
          } else {
            setHeadlines(formatted);
          }
        }
      } catch (err) {
        console.error('Failed to fetch marquee issues:', err);
      }
    }
    
    fetchTopIssues();
  }, [location]);

  const marqueeContent = headlines.join(' ✦ ');

  return (
    <div className="w-full h-full bg-[#3f5231] flex items-center overflow-hidden relative panel border-b border-[#DCCCAC]/30 shadow-inner">
      <div className="whitespace-nowrap animate-[marquee_40s_linear_infinite] flex items-center gap-8 text-[#FFF8EC]/90 font-bold uppercase tracking-widest text-[11px] sm:text-xs">
        <span>{marqueeContent}</span>
        <span className="text-[#DCCCAC]">✦</span>
        <span>{marqueeContent}</span>
        <span className="text-[#DCCCAC]">✦</span>
        <span>{marqueeContent}</span>
        <span className="text-[#DCCCAC]">✦</span>
        <span>{marqueeContent}</span>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
