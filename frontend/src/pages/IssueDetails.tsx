import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import VerificationBadge from '../components/VerificationBadge';
import {
  MapPin, Clock, ShieldCheck, ChevronLeft, Sparkles, AlertTriangle,
  ThumbsUp, ThumbsDown, HelpCircle, Send, Camera, Loader2, MessageSquare,
  User as UserIcon, Star, Upload, Brain,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const SEVERITY_STYLES: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  Reported: 'bg-blue-500',
  'AI Verified': 'bg-indigo-500',
  'Community Verified': 'bg-emerald-500',
  Assigned: 'bg-amber-500',
  'In Progress': 'bg-cyan-500',
  Resolved: 'bg-green-500',
  Closed: 'bg-slate-400',
};

interface VerificationStats {
  total_votes: number;
  confirm_count: number;
  reject_count: number;
  need_evidence_count: number;
  confidence: number;
  community_score: number;
}

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  text: string;
  created_at: any;
}

export default function IssueDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [issue, setIssue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verificationStats, setVerificationStats] = useState<VerificationStats | null>(null);
  const [userVote, setUserVote] = useState<any>(null);
  const [voteLoading, setVoteLoading] = useState(false);
  const [confidence, setConfidence] = useState(4);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [resolutionUploading, setResolutionUploading] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const isReporter = issue?.reporter_id === user?.uid;

  // ─── Fetch Issue ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    // Realtime issue subscription
    const unsubscribe = onSnapshot(doc(db, 'issues', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setIssue(data);
        setVerificationStats((data as any).verification_stats || null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  // ─── Fetch User's Vote ───────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;

    async function fetchUserVote() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/verification/${id}/user/${user!.uid}`);
        const data = await res.json();
        if (data.has_voted) {
          setUserVote(data.vote);
        }
      } catch (err) {
        console.error('Failed to fetch user vote:', err);
      }
    }

    fetchUserVote();
  }, [id, user]);

  // ─── Realtime Comments ────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, 'issues', id, 'comments'),
      orderBy('created_at', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const commentData: Comment[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Comment));
      setComments(commentData);
    });

    return () => unsubscribe();
  }, [id]);

  // ─── Fetch Evidence ───────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    async function fetchEvidence() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/verification/${id}/evidence`);
        const data = await res.json();
        setEvidence(data);
      } catch (err) {
        console.error('Failed to fetch evidence:', err);
      }
    }

    fetchEvidence();
  }, [id]);

  // ─── Submit Vote ──────────────────────────────────────────
  const handleVote = async (vote: 'confirm' | 'reject' | 'need_evidence') => {
    if (!user || !id || isReporter) return;
    setVoteLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/verification/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: id,
          user_id: user.uid,
          user_name: user.displayName,
          vote,
          confidence: confidence / 5, // Normalize 1-5 to 0-1
          comment: '',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Vote failed');
      }

      setUserVote({ vote, confidence: confidence / 5 });
      setVerificationStats(data.stats);

      addToast({
        type: 'success',
        title: 'Vote recorded!',
        message: vote === 'confirm' ? 'You confirmed this issue' :
                 vote === 'reject' ? 'You rejected this issue' :
                 'You requested more evidence',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Vote failed',
        message: err.message,
      });
    } finally {
      setVoteLoading(false);
    }
  };

  // ─── Submit Comment ───────────────────────────────────────
  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !user || !id) return;
    setCommentLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/issues/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.uid,
          user_name: user.displayName,
          user_avatar: user.photoURL,
          text: commentText.trim(),
        }),
      });

      if (!res.ok) throw new Error('Failed to post comment');

      setCommentText('');
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Comment failed', message: err.message });
    } finally {
      setCommentLoading(false);
    }
  };

  // ─── Upload Evidence ──────────────────────────────────────
  const handleEvidenceUpload = async (file: File) => {
    if (!user || !id) return;
    setEvidenceUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('issue_id', id);
      formData.append('user_id', user.uid);
      formData.append('description', 'Additional evidence');

      const res = await fetch(`${BACKEND_URL}/api/verification/evidence`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Evidence upload failed');

      const data = await res.json();
      setEvidence((prev) => [{ ...data, created_at: new Date() }, ...prev]);
      addToast({ type: 'success', title: 'Evidence uploaded', message: 'Additional proof has been added' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Upload failed', message: err.message });
    } finally {
      setEvidenceUploading(false);
    }
  };

  // ─── Upload Resolution Proof ──────────────────────────────
  const handleResolutionUpload = async (file: File) => {
    if (!user || !id) return;
    setResolutionUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', user.uid);

      const res = await fetch(`${BACKEND_URL}/api/issues/${id}/resolve`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resolution verification failed');

      if (data.is_resolved) {
        addToast({ type: 'success', title: 'Issue Resolved!', message: `AI confirmed resolution with ${Math.round(data.confidence * 100)}% confidence.` });
      } else {
        addToast({ type: 'error', title: 'Resolution Denied', message: `AI determined the issue is not resolved. ${data.reasoning}` });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Verification Error', message: err.message });
    } finally {
      setResolutionUploading(false);
    }
  };

  // ─── Loading / Not Found States ────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!issue) return (
    <div className="p-8 text-center">
      <AlertTriangle className="mx-auto text-[#546B41]/30 mb-3" size={48} />
      <p className="text-[#546B41]/60 font-medium">Issue not found</p>
      <Link to="/" className="text-blue-500 text-sm mt-2 inline-block hover:underline">Go back to feed</Link>
    </div>
  );

  const confidencePercentage = verificationStats
    ? Math.round((verificationStats.community_score || 0) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 pb-24" style={{ transform: 'scale(0.88)', transformOrigin: 'top center' }}>
        {/* Back nav */}
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-[#546B41] hover:text-[#435733] mb-4 transition-colors font-medium">
          <ChevronLeft size={16} />
          Back to Feed
        </Link>

        {/* ═══ Main 2-column layout ═══ */}
        <div className="lg:grid lg:grid-cols-[1fr_380px] gap-5">

          {/* ═══ Left Column: Issue Content ═══ */}
          <div className="space-y-4">

            {/* Hero Card */}
            <div className="bg-[#FFF8EC] rounded-2xl overflow-hidden border border-[#DCCCAC] shadow-sm">
              {/* Media */}
              {issue.status === 'Resolved' && issue.resolution_media_url && issue.media_urls?.[0] ? (
                <div className="w-full flex h-56 bg-black">
                  <div className="flex-1 border-r-2 border-white relative">
                    <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Before</span>
                    <img src={issue.media_urls[0].replace(/^http:/i, 'https:')} className="w-full h-full object-cover opacity-80" alt="Before" />
                  </div>
                  <div className="flex-1 relative">
                    <span className="absolute top-2 right-2 bg-emerald-500/80 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">After</span>
                    <img src={issue.resolution_media_url.replace(/^http:/i, 'https:')} className="w-full h-full object-cover" alt="After" />
                  </div>
                </div>
              ) : issue.media_urls?.[0] ? (
                issue.media_urls[0].match(/\.(mp4|webm|mov|avi)($|\?)/i) ? (
                  <video src={issue.media_urls[0].replace(/^http:/i, 'https:')} controls className="w-full h-56 object-contain bg-black" />
                ) : (
                  <img src={issue.media_urls[0].replace(/^http:/i, 'https:')} className="w-full h-56 object-cover" alt="Issue" />
                )
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-[#DCCCAC]/30 to-[#FFF8EC] flex items-center justify-center text-[#DCCCAC]">
                  <MapPin size={40} />
                </div>
              )}

              <div className="p-5">
                {/* Title + Status */}
                <div className="flex justify-between items-start gap-3 mb-3">
                  <h1 className="text-lg font-bold text-[#546B41] leading-tight">{issue.title || 'Untitled Issue'}</h1>
                  <div className="flex items-center gap-1.5 shrink-0 bg-white px-2.5 py-1 rounded-full border border-[#DCCCAC]/50">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[issue.status] || 'bg-slate-400'}`} />
                    <span className="text-[10px] font-bold text-[#546B41]/60 uppercase">{issue.status}</span>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_STYLES[issue.severity] || 'bg-slate-100 text-[#546B41]/60'}`}>
                    {issue.severity}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#546B41]/10 text-[#546B41]">
                    {issue.category}
                  </span>
                  <VerificationBadge stats={verificationStats || undefined} size="sm" />
                </div>

                <p className="text-[#546B41]/60 text-sm leading-relaxed mb-4">{issue.description}</p>

                {/* Metadata */}
                <div className="flex flex-wrap gap-4 text-xs text-[#546B41]/50 mb-4">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-[#546B41]" />
                    <span className="truncate max-w-[200px]">{issue.address || 'Unknown location'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-[#546B41]" />
                    <span>{issue.created_at?.toDate?.().toLocaleString?.() || 'Unknown time'}</span>
                  </div>
                </div>

                {/* Voice Note Section */}
                {issue.voice_note_url && (
                  <div className="bg-[#546B41]/5 border border-[#DCCCAC]/50 rounded-xl p-3 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="bg-[#546B41] rounded-full p-1.5 text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                      </div>
                      <span className="text-xs font-bold text-[#546B41] uppercase tracking-wider">Voice Note</span>
                      {issue.voice_note_lang && <span className="text-[10px] text-[#546B41]/60 bg-white px-2 py-0.5 rounded-full border border-[#DCCCAC]/30">{issue.voice_note_lang}</span>}
                    </div>
                    <audio src={issue.voice_note_url} controls className="h-8 w-full rounded-md mb-2" />
                    <p className="text-xs italic text-[#546B41]/80 bg-white p-2 rounded border border-[#DCCCAC]/30">"{issue.voice_note_text}"</p>
                    {issue.voice_note_english && issue.voice_note_english !== issue.voice_note_text && (
                      <p className="text-[10px] text-slate-500 mt-1 pl-2 border-l-2 border-[#DCCCAC]/50">
                        <strong>Translation:</strong> "{issue.voice_note_english}"
                      </p>
                    )}
                  </div>
                )}
                
                {/* Resolution Info */}
                {issue.status === 'Resolved' && issue.resolution_reasoning && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck size={14} className="text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">AI Verified Resolution</span>
                    </div>
                    <p className="text-xs text-emerald-700 leading-relaxed font-medium">{issue.resolution_reasoning}</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Analysis */}
            {issue.ai_analysis && (
              <div className="bg-gradient-to-r from-[#546B41]/10 to-emerald-50 rounded-2xl p-5 border border-[#546B41]/20 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#546B41]">
                    <Sparkles size={16} />
                    AI Analysis
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full">
                    {Math.round((issue.ai_analysis.confidence || 0) * 100)}% Confidence
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/70 rounded-lg p-2.5 text-center border border-[#DCCCAC]/40">
                    <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold">Danger</div>
                    <div className={`text-lg font-black ${(issue.ai_analysis.danger_score || 0) >= 7 ? 'text-red-600' : (issue.ai_analysis.danger_score || 0) >= 4 ? 'text-orange-500' : 'text-[#546B41]'}`}>
                      {issue.ai_analysis.danger_score}/10
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2.5 text-center border border-[#DCCCAC]/40">
                    <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold">Radius</div>
                    <div className="text-xs font-bold text-[#546B41]/70 mt-1">{issue.ai_analysis.estimated_affected_radius_meters || '—'}m</div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2.5 text-center border border-[#DCCCAC]/40">
                    <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold">Response</div>
                    <div className="text-[10px] font-bold text-[#546B41]/70 mt-1">{issue.severity === 'Critical' ? '2-4 hrs' : issue.severity === 'High' ? '24 hrs' : issue.severity === 'Medium' ? '3-5 days' : '7-14 days'}</div>
                  </div>
                </div>
                {issue.ai_analysis.recommended_action && (
                  <div className="bg-white/60 rounded-lg p-3 border border-[#DCCCAC]/30">
                    <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold mb-0.5">Recommended Action</div>
                    <p className="text-xs text-[#546B41]/70 font-medium leading-relaxed">{issue.ai_analysis.recommended_action}</p>
                  </div>
                )}
              </div>
            )}

            {/* Smart Insights (Replacing Agent Pipeline) */}
            {(issue.agent_pipeline || issue.ai_analysis) && (
              <div className="bg-[#546B41]/5 rounded-2xl p-6 border border-[#DCCCAC]/50 shadow-sm space-y-5">
                <h3 className="text-[15px] font-black text-[#546B41] flex items-center gap-2 uppercase tracking-wide">
                  <Sparkles size={18} className="text-[#D4A853]" />
                  Smart Insights
                </h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl p-3 border border-[#DCCCAC]/30 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-[#546B41]/50 uppercase tracking-widest mb-1">Priority</span>
                    <span className={`text-xl font-black ${issue.priority_label === 'Critical' ? 'text-red-600' : issue.priority_label === 'High' ? 'text-orange-500' : issue.priority_label === 'Medium' ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {issue.priority_score || '--'}
                    </span>
                    <span className="text-[9px] font-bold text-[#546B41]/70 uppercase">{issue.priority_label || 'Unknown'}</span>
                  </div>
                  
                  <div className="bg-white rounded-xl p-3 border border-[#DCCCAC]/30 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-[#546B41]/50 uppercase tracking-widest mb-1">Response</span>
                    <Clock size={20} className="text-[#546B41] mb-1" />
                    <span className="text-[10px] font-bold text-[#546B41]/80">{issue.recommended_response_time || 'TBD'}</span>
                  </div>
                  
                  <div className="bg-white rounded-xl p-3 border border-[#DCCCAC]/30 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-[#546B41]/50 uppercase tracking-widest mb-1">Escalation</span>
                    <ShieldCheck size={20} className={issue.escalation?.escalation_level > 0 ? 'text-red-500 mb-1' : 'text-emerald-500 mb-1'} />
                    <span className="text-[10px] font-bold text-[#546B41]/80">Level {issue.escalation?.escalation_level || 0}</span>
                  </div>
                  
                  <div className="bg-white rounded-xl p-3 border border-[#DCCCAC]/30 shadow-sm flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-[#546B41]/50 uppercase tracking-widest mb-1">Duplicates</span>
                    <AlertTriangle size={20} className={issue.duplicate_check?.is_likely_duplicate ? 'text-orange-500 mb-1' : 'text-emerald-500 mb-1'} />
                    <span className="text-[10px] font-bold text-[#546B41]/80">
                      {issue.duplicate_check?.is_likely_duplicate ? `${issue.duplicate_check.duplicate_count} Found` : 'Unique'}
                    </span>
                  </div>
                </div>

                {issue.priority_reasoning && (
                  <div className="bg-[#FFF8EC] rounded-xl p-4 border border-[#DCCCAC]/60">
                    <h4 className="text-[10px] font-black text-[#546B41]/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Brain size={12} /> AI Reasoning
                    </h4>
                    <p className="text-xs text-[#546B41]/80 leading-relaxed font-medium">
                      {issue.priority_reasoning}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══ Right Column: Verification + Comments ═══ */}
          <div className="space-y-4 mt-4 lg:mt-0">

            {/* Community Verification */}
            <div className="bg-[#FFF8EC] rounded-2xl p-5 border border-[#DCCCAC] shadow-sm">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-[#546B41]">
                <ShieldCheck size={16} />
                Community Verification
              </h3>

              {/* Confidence Bar */}
              {verificationStats && verificationStats.total_votes > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="text-[#546B41]/70 font-bold text-xs uppercase tracking-wider block mb-0.5">Community Consensus</span>
                      <span className="text-[10px] text-[#546B41]/50 font-medium">Based on {verificationStats.total_votes} verified user votes</span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-2xl" style={{
                        color: confidencePercentage >= 70 ? '#059669' : confidencePercentage >= 40 ? '#d97706' : '#dc2626'
                      }}>
                        {confidencePercentage}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="h-3 bg-[#DCCCAC]/30 rounded-full overflow-hidden border border-[#DCCCAC]/20">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                      style={{
                        width: `${confidencePercentage}%`,
                        background: confidencePercentage >= 70
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : confidencePercentage >= 40
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #ef4444, #dc2626)',
                      }}
                    />
                  </div>
                  
                  <div className="flex justify-between mt-3 bg-white/50 rounded-lg p-2 border border-[#DCCCAC]/30">
                    <div className="flex flex-col items-center flex-1 border-r border-[#DCCCAC]/30">
                      <ThumbsUp size={14} className="text-emerald-500 mb-1" />
                      <span className="text-xs font-bold text-[#546B41]">{verificationStats.confirm_count}</span>
                      <span className="text-[8px] uppercase text-[#546B41]/50 font-bold tracking-wider">Confirm</span>
                    </div>
                    <div className="flex flex-col items-center flex-1 border-r border-[#DCCCAC]/30">
                      <ThumbsDown size={14} className="text-red-500 mb-1" />
                      <span className="text-xs font-bold text-[#546B41]">{verificationStats.reject_count}</span>
                      <span className="text-[8px] uppercase text-[#546B41]/50 font-bold tracking-wider">Reject</span>
                    </div>
                    <div className="flex flex-col items-center flex-1">
                      <HelpCircle size={14} className="text-amber-500 mb-1" />
                      <span className="text-xs font-bold text-[#546B41]">{verificationStats.need_evidence_count}</span>
                      <span className="text-[8px] uppercase text-[#546B41]/50 font-bold tracking-wider">Evidence</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vote UI */}
              {isReporter ? (
                <div className="bg-white rounded-xl p-3 text-center text-xs text-[#546B41]/50 border border-[#DCCCAC]/50">
                  <UserIcon size={14} className="mx-auto mb-1 text-[#546B41]/40" />
                  You reported this issue
                </div>
              ) : userVote ? (
                <div className="bg-emerald-50 rounded-xl p-3 text-center text-xs text-emerald-700 border border-emerald-200">
                  <ShieldCheck size={14} className="mx-auto mb-1" />
                  Voted: <span className="font-bold capitalize">{userVote.vote || userVote}</span>
                </div>
              ) : (
                <div>
                  <div className="mb-3">
                    <label className="text-[10px] font-bold text-[#546B41]/50 mb-1.5 block uppercase tracking-wider">Confidence</label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setConfidence(star)}
                          className={`transition-all ${star <= confidence ? 'text-amber-400 scale-110' : 'text-[#546B41]/20 hover:text-amber-200'}`}
                        >
                          <Star size={18} fill={star <= confidence ? 'currentColor' : 'none'} />
                        </button>
                      ))}
                      <span className="text-[10px] text-[#546B41]/40 ml-1">
                        {confidence === 1 ? 'Very Low' : confidence === 2 ? 'Low' : confidence === 3 ? 'Medium' : confidence === 4 ? 'High' : 'Very High'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleVote('confirm')} disabled={voteLoading} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-50 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 border border-emerald-200 transition-all text-xs disabled:opacity-50">
                      {voteLoading ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                      Confirm
                    </button>
                    <button onClick={() => handleVote('reject')} disabled={voteLoading} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-50 text-red-700 font-bold rounded-xl hover:bg-red-100 border border-red-200 transition-all text-xs disabled:opacity-50">
                      {voteLoading ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
                      Reject
                    </button>
                    <button onClick={() => handleVote('need_evidence')} disabled={voteLoading} className="flex items-center justify-center px-3 py-2.5 bg-amber-50 text-amber-700 font-bold rounded-xl hover:bg-amber-100 border border-amber-200 transition-all text-xs disabled:opacity-50">
                      <HelpCircle size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Evidence */}
              {evidence.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#DCCCAC]/30">
                  <h4 className="text-[10px] font-bold text-[#546B41]/50 mb-2 flex items-center gap-1 uppercase tracking-wider">
                    <Camera size={11} />
                    Evidence ({evidence.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-1.5">
                    {evidence.map((ev: any, i: number) => (
                      ev.media_url && (
                        <img key={i} src={ev.media_url.replace(/^http:/i, 'https:')} alt="Evidence" className="w-full h-16 object-cover rounded-lg border border-[#DCCCAC]/40" />
                      )
                    ))}
                  </div>
                </div>
              )}

              {!isReporter && issue.status !== 'Resolved' && (
                <div className="mt-3 flex gap-3">
                  <label className="flex items-center gap-1.5 text-[10px] text-[#546B41] cursor-pointer hover:text-[#435733] transition-colors font-bold">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleEvidenceUpload(e.target.files[0]); }} />
                    {evidenceUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    Upload evidence
                  </label>
                  
                  <label className="flex items-center gap-1.5 text-[10px] text-emerald-600 cursor-pointer hover:text-emerald-700 transition-colors font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleResolutionUpload(e.target.files[0]); }} />
                    {resolutionUploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                    Submit Resolution Proof
                  </label>
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="bg-[#FFF8EC] rounded-2xl p-5 border border-[#DCCCAC] shadow-sm">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-[#546B41]">
                <MessageSquare size={16} />
                Comments ({comments.length})
              </h3>

              <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar mb-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-[#546B41]/40 text-center py-6">
                    No comments yet. Be the first to share your thoughts!
                  </p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2.5">
                      <img
                        src={comment.user_avatar || `https://ui-avatars.com/api/?name=${comment.user_name}&size=28`}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full bg-slate-100 shrink-0 object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-bold text-[#546B41]/80">{comment.user_name}</span>
                          <span className="text-[9px] text-[#546B41]/40">
                            {comment.created_at?.toDate?.()?.toLocaleString?.() ||
                             (comment.created_at ? new Date(comment.created_at).toLocaleString() : 'Just now')}
                          </span>
                        </div>
                        <p className="text-xs text-[#546B41]/60 mt-0.5 leading-relaxed">{comment.text}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>

              {user && (
                <div className="flex gap-2 border-t border-[#DCCCAC]/30 pt-3">
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&size=28`}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full bg-slate-100 shrink-0 object-cover"
                  />
                  <div className="flex-1 flex gap-1.5 min-w-0">
                    <input
                      type="text"
                      placeholder="Write a comment..."
                      className="flex-1 min-w-0 px-3 py-2 bg-white border border-[#DCCCAC]/50 rounded-xl text-xs focus:ring-2 focus:ring-[#546B41] focus:border-[#546B41] outline-none transition-all"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleCommentSubmit();
                        }
                      }}
                    />
                    <button
                      onClick={handleCommentSubmit}
                      disabled={!commentText.trim() || commentLoading}
                      className="px-3 py-2 bg-[#546B41] text-white rounded-xl hover:bg-[#435733] disabled:opacity-50 transition-colors flex items-center"
                    >
                      {commentLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}