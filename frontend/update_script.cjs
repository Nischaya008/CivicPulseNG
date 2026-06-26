const fs = require('fs');
const lines = fs.readFileSync('src/pages/IssueDetails.tsx', 'utf8').split('\n');

const newContent = `  return (
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
              {issue.media_urls?.[0] ? (
                issue.media_urls[0].match(/\\.(mp4|webm|mov|avi)($|\\?)/i) ? (
                  <video src={issue.media_urls[0]} controls className="w-full h-56 object-contain bg-black" />
                ) : (
                  <img src={issue.media_urls[0]} className="w-full h-56 object-cover" alt="Issue" />
                )
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-[#DCCCAC]/30 to-[#FFF8EC] flex items-center justify-center text-[#DCCCAC]">
                  <MapPin size={40} />
                </div>
              )}

              <div className="p-5">
                {/* Title + Status */}
                <div className="flex justify-between items-start gap-3 mb-3">
                  <h1 className="text-lg font-bold text-slate-900 leading-tight">{issue.title || 'Untitled Issue'}</h1>
                  <div className="flex items-center gap-1.5 shrink-0 bg-white px-2.5 py-1 rounded-full border border-[#DCCCAC]/50">
                    <div className={\`w-2 h-2 rounded-full \${STATUS_COLORS[issue.status] || 'bg-slate-400'}\`} />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">{issue.status}</span>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className={\`px-2.5 py-0.5 rounded-full text-[10px] font-bold \${SEVERITY_STYLES[issue.severity] || 'bg-slate-100 text-slate-600'}\`}>
                    {issue.severity}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#546B41]/10 text-[#546B41]">
                    {issue.category}
                  </span>
                  <VerificationBadge stats={verificationStats || undefined} size="sm" />
                </div>

                <p className="text-slate-600 text-sm leading-relaxed mb-4">{issue.description}</p>

                {/* Metadata */}
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-[#546B41]" />
                    <span className="truncate max-w-[200px]">{issue.address || 'Unknown location'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-[#546B41]" />
                    <span>{issue.created_at?.toDate?.().toLocaleString?.() || 'Unknown time'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            {issue.ai_analysis && (
              <div className="bg-gradient-to-r from-[#546B41]/10 to-emerald-50 rounded-2xl p-5 border border-[#546B41]/20 shadow-sm space-y-3">
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
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Danger</div>
                    <div className={\`text-lg font-black \${(issue.ai_analysis.danger_score || 0) >= 7 ? 'text-red-600' : (issue.ai_analysis.danger_score || 0) >= 4 ? 'text-orange-500' : 'text-[#546B41]'}\`}>
                      {issue.ai_analysis.danger_score}/10
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2.5 text-center border border-[#DCCCAC]/40">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Radius</div>
                    <div className="text-xs font-bold text-slate-700 mt-1">{issue.ai_analysis.estimated_affected_radius_meters || '—'}m</div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2.5 text-center border border-[#DCCCAC]/40">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Response</div>
                    <div className="text-[10px] font-bold text-slate-700 mt-1">{issue.severity === 'Critical' ? '2-4 hrs' : issue.severity === 'High' ? '24 hrs' : issue.severity === 'Medium' ? '3-5 days' : '7-14 days'}</div>
                  </div>
                </div>
                {issue.ai_analysis.recommended_action && (
                  <div className="bg-white/60 rounded-lg p-3 border border-[#DCCCAC]/30">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">Recommended Action</div>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">{issue.ai_analysis.recommended_action}</p>
                  </div>
                )}
              </div>
            )}

            {/* Agent Pipeline */}
            {issue.agent_pipeline && (
              <AgentPipeline
                issueId={id!}
                pipeline={issue.agent_pipeline}
                priorityScore={issue.priority_score || null}
                priorityLabel={issue.priority_label || null}
                priorityReasoning={issue.priority_reasoning || null}
                escalation={issue.escalation || null}
                duplicateCheck={issue.duplicate_check || null}
                recommendedResponseTime={issue.recommended_response_time || null}
              />
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
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-500 font-medium">Community Confidence</span>
                    <span className="font-black text-base" style={{
                      color: confidencePercentage >= 70 ? '#059669' : confidencePercentage >= 40 ? '#d97706' : '#dc2626'
                    }}>
                      {confidencePercentage}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#DCCCAC]/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: \`\${confidencePercentage}%\`,
                        background: confidencePercentage >= 70
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : confidencePercentage >= 40
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #ef4444, #dc2626)',
                      }}
                    />
                  </div>
                  <div className="flex gap-3 mt-2 text-[10px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                      <ThumbsUp size={10} className="text-emerald-500" />
                      {verificationStats.confirm_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsDown size={10} className="text-red-500" />
                      {verificationStats.reject_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <HelpCircle size={10} className="text-amber-500" />
                      {verificationStats.need_evidence_count}
                    </span>
                  </div>
                </div>
              )}

              {/* Vote UI */}
              {isReporter ? (
                <div className="bg-white rounded-xl p-3 text-center text-xs text-slate-500 border border-[#DCCCAC]/50">
                  <UserIcon size={14} className="mx-auto mb-1 text-slate-400" />
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
                    <label className="text-[10px] font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Confidence</label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setConfidence(star)}
                          className={\`transition-all \${star <= confidence ? 'text-amber-400 scale-110' : 'text-slate-200 hover:text-amber-200'}\`}
                        >
                          <Star size={18} fill={star <= confidence ? 'currentColor' : 'none'} />
                        </button>
                      ))}
                      <span className="text-[10px] text-slate-400 ml-1">
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
                  <h4 className="text-[10px] font-bold text-slate-500 mb-2 flex items-center gap-1 uppercase tracking-wider">
                    <Camera size={11} />
                    Evidence ({evidence.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-1.5">
                    {evidence.map((ev: any, i: number) => (
                      ev.media_url && (
                        <img key={i} src={ev.media_url} alt="Evidence" className="w-full h-16 object-cover rounded-lg border border-[#DCCCAC]/40" />
                      )
                    ))}
                  </div>
                </div>
              )}

              {!isReporter && (
                <div className="mt-3">
                  <label className="flex items-center gap-1.5 text-[10px] text-[#546B41] cursor-pointer hover:text-[#435733] transition-colors font-bold">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleEvidenceUpload(e.target.files[0]); }} />
                    {evidenceUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    Upload evidence
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
                  <p className="text-xs text-slate-400 text-center py-6">
                    No comments yet. Be the first to share your thoughts!
                  </p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2.5">
                      <img
                        src={comment.user_avatar || \`https://ui-avatars.com/api/?name=\${comment.user_name}&size=28\`}
                        alt=""
                        className="w-7 h-7 rounded-full bg-slate-100 shrink-0 object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-bold text-slate-800">{comment.user_name}</span>
                          <span className="text-[9px] text-slate-400">
                            {comment.created_at?.toDate?.()?.toLocaleString?.() ||
                             (comment.created_at ? new Date(comment.created_at).toLocaleString() : 'Just now')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{comment.text}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>

              {user && (
                <div className="flex gap-2 border-t border-[#DCCCAC]/30 pt-3">
                  <img
                    src={user.photoURL || \`https://ui-avatars.com/api/?name=\${user.displayName}&size=28\`}
                    alt=""
                    className="w-7 h-7 rounded-full bg-slate-100 shrink-0 object-cover"
                  />
                  <div className="flex-1 flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Write a comment..."
                      className="flex-1 px-3 py-2 bg-white border border-[#DCCCAC]/50 rounded-xl text-xs focus:ring-2 focus:ring-[#546B41] focus:border-[#546B41] outline-none transition-all"
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
}`;

lines.splice(266, lines.length - 266, newContent, '}');
fs.writeFileSync('src/pages/IssueDetails.tsx', lines.join('\n'));
console.log('Update complete.');
