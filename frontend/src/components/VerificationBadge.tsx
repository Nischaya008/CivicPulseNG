import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

interface VerificationBadgeProps {
  stats?: {
    total_votes: number;
    confirm_count: number;
    reject_count: number;
    need_evidence_count: number;
    confidence: number;
    community_score: number;
  };
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function VerificationBadge({ stats, size = 'md', showLabel = true }: VerificationBadgeProps) {
  if (!stats || stats.total_votes === 0) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${size === 'sm' ? 'text-[10px]' : 'text-xs'} text-slate-400`}>
        <ShieldQuestion size={size === 'sm' ? 12 : size === 'lg' ? 18 : 14} />
        {showLabel && <span>Not verified</span>}
      </div>
    );
  }

  const percentage = Math.round(stats.community_score * 100);
  const isVerified = percentage >= 70;
  const isRejected = stats.reject_count > stats.confirm_count && stats.total_votes >= 3;

  const colorClass = isRejected
    ? 'text-red-600'
    : isVerified
      ? 'text-emerald-600'
      : 'text-amber-600';

  const bgClass = isRejected
    ? 'bg-red-50 border-red-200'
    : isVerified
      ? 'bg-emerald-50 border-emerald-200'
      : 'bg-amber-50 border-amber-200';

  const Icon = isRejected ? ShieldAlert : ShieldCheck;

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1 text-[10px] font-medium ${colorClass}`}>
        <Icon size={12} />
        {showLabel && <span>{percentage}%</span>}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${bgClass} ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>
      <Icon size={size === 'lg' ? 18 : 14} className={colorClass} />
      <span className={`font-semibold ${colorClass}`}>{percentage}%</span>
      {showLabel && (
        <span className="text-slate-500 font-medium">
          {isRejected ? 'Rejected' : isVerified ? 'Verified' : 'Verifying'}
        </span>
      )}
      <span className="text-slate-400 text-[10px]">({stats.total_votes} votes)</span>
    </div>
  );
}
