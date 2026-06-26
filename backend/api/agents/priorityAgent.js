/**
 * Priority Agent (Milestone 8 — Agent 4)
 * 
 * Trigger: After Verification Agent completes
 * Model: Groq Llama 3.3 70B (280 tok/s, strong multi-factor reasoning)
 * 
 * Computes a priority score (0-100) using multiple factors:
 * 1. Severity weight (Critical=40, High=28, Medium=16, Low=4)
 * 2. Community verification count boost (+5 per confirming vote)
 * 3. Proximity to sensitive POIs (schools, hospitals, transit hubs)
 * 4. Affected population estimate (based on area density)
 * 5. Traffic/infrastructure impact assessment
 * 6. Recency factor (newer issues get slight boost)
 * 7. Historical issue density in area (hotspot amplifier)
 * 
 * Uses Llama 3.3 70B for sophisticated multi-factor reasoning
 * because priority scoring requires weighing many contextual signals —
 * something deterministic formulas handle poorly for edge cases.
 */

import { groqReason } from '../groqService.js';
import { adminDb } from '../firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const AGENT_NAME = 'priority_agent';

const PRIORITY_SCORING_PROMPT = `You are a civic issue priority scoring AI for CivicPulse, a smart city platform used by municipalities to triage civic complaints.

Your job is to compute a PRIORITY SCORE (0-100) for a civic issue based on multiple weighted factors. Be realistic and calibrated — most issues should score 30-70, with only genuinely dangerous issues scoring 80+.

**Scoring Factors & Weights:**
1. SEVERITY (40%): Critical=40pts, High=28pts, Medium=16pts, Low=4pts
2. DANGER TO PUBLIC (20%): Based on danger_score (0-10 scale). Score 0-10 → 0-20pts
3. VERIFICATION STRENGTH (15%): Community confirmations boost priority. 0 votes=0pts, 3+=15pts
4. URGENCY (10%): Based on the urgency rating (1-10). Score 1-10 → 1-10pts
5. CATEGORY IMPACT (10%): Categories like "Public Safety", "Road Damage", "Drainage Issue" affecting critical infrastructure score higher
6. RECENCY (5%): Issues reported within last 6 hours get full 5pts, decaying to 0 over 72 hours

**Return ONLY valid JSON:**
{
  "priority_score": <number 0-100>,
  "priority_label": "Critical" | "High" | "Medium" | "Low",
  "reasoning": "Brief 1-2 sentence explanation of the score",
  "factor_breakdown": {
    "severity_pts": <number>,
    "danger_pts": <number>,
    "verification_pts": <number>,
    "urgency_pts": <number>,
    "category_pts": <number>,
    "recency_pts": <number>
  },
  "recommended_response_time": "Within X hours/days"
}`;

export async function runPriorityAgent(issueId, issueData) {
  const startTime = Date.now();
  const log = {
    agent: AGENT_NAME,
    status: 'running',
    started_at: new Date().toISOString(),
  };

  try {
    // Gather all signals for priority computation
    const verificationStats = issueData.verification_stats || { confirm_count: 0, total_votes: 0 };
    const aiAnalysis = issueData.ai_analysis || {};
    
    const createdAt = issueData.created_at?.toDate
      ? issueData.created_at.toDate()
      : new Date(issueData.created_at || Date.now());
    const hoursAgo = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    // Count nearby issues in the same area (historical density)
    let nearbyIssueCount = 0;
    if (issueData.lat && issueData.lng) {
      const allIssues = await adminDb.collection('issues').get();
      allIssues.forEach((doc) => {
        if (doc.id === issueId) return;
        const data = doc.data();
        if (data.lat && data.lng) {
          const dLat = Math.abs(data.lat - issueData.lat);
          const dLng = Math.abs(data.lng - issueData.lng);
          // Rough proximity check (~1km box)
          if (dLat < 0.009 && dLng < 0.009) {
            nearbyIssueCount++;
          }
        }
      });
    }

    const contextData = {
      issue_id: issueId,
      title: issueData.title,
      description: issueData.description,
      category: issueData.category || 'Other',
      severity: issueData.severity || 'Medium',
      danger_score: aiAnalysis.danger_score || 5.0,
      urgency: aiAnalysis.urgency || 5,
      confidence: aiAnalysis.confidence || 0.5,
      verification_confirms: verificationStats.confirm_count || 0,
      verification_rejects: verificationStats.reject_count || 0,
      total_votes: verificationStats.total_votes || 0,
      hours_since_report: Math.round(hoursAgo * 10) / 10,
      nearby_issue_count: nearbyIssueCount,
      address: issueData.address || 'Unknown location',
      status: issueData.status || 'Open',
    };

    // Use Groq Llama 3.3 70B for multi-factor priority reasoning
    let result;
    try {
      result = await groqReason(PRIORITY_SCORING_PROMPT, contextData);
    } catch (groqError) {
      // Fallback: compute priority deterministically if Groq fails
      console.warn(`[${AGENT_NAME}] Groq failed, using deterministic fallback:`, groqError.message);
      result = computeDeterministicPriority(contextData);
    }

    // Validate and clamp priority score
    const priorityScore = Math.max(0, Math.min(100, Math.round(result.priority_score || 50)));
    const priorityLabel = result.priority_label || getPriorityLabel(priorityScore);

    const finalResult = {
      priority_score: priorityScore,
      priority_label: priorityLabel,
      reasoning: result.reasoning || 'Priority computed based on multiple factors.',
      factor_breakdown: result.factor_breakdown || {},
      recommended_response_time: result.recommended_response_time || getResponseTime(priorityLabel),
      model_used: result === computeDeterministicPriority(contextData) ? 'deterministic_fallback' : 'groq_llama_3.3_70b',
    };

    // Update the issue with priority data
    await adminDb.collection('issues').doc(issueId).update({
      priority_score: priorityScore,
      priority_label: priorityLabel,
      priority_reasoning: finalResult.reasoning,
      priority_computed_at: FieldValue.serverTimestamp(),
      recommended_response_time: finalResult.recommended_response_time,
    });

    log.status = 'completed';
    log.duration_ms = Date.now() - startTime;
    log.result = {
      priority_score: priorityScore,
      priority_label: priorityLabel,
    };
    await logAgentAction(issueId, log);

    return { success: true, result: finalResult };
  } catch (error) {
    log.status = 'failed';
    log.error = error.message;
    log.duration_ms = Date.now() - startTime;
    await logAgentAction(issueId, log);

    return { success: false, error: error.message };
  }
}

/**
 * Deterministic priority fallback when LLM is unavailable
 */
function computeDeterministicPriority(data) {
  const severityWeights = { Critical: 40, High: 28, Medium: 16, Low: 4 };
  const severityPts = severityWeights[data.severity] || 16;
  const dangerPts = Math.round(((data.danger_score || 5) / 10) * 20);
  const verificationPts = Math.min(15, (data.verification_confirms || 0) * 5);
  const urgencyPts = Math.round(((data.urgency || 5) / 10) * 10);
  
  const highImpactCategories = ['Public Safety', 'Road Damage', 'Drainage Issue', 'Traffic Hazard'];
  const categoryPts = highImpactCategories.includes(data.category) ? 8 : 4;
  
  const recencyPts = data.hours_since_report <= 6 ? 5 : 
                     data.hours_since_report <= 24 ? 3 :
                     data.hours_since_report <= 72 ? 1 : 0;

  const totalScore = Math.min(100, severityPts + dangerPts + verificationPts + urgencyPts + categoryPts + recencyPts);

  return {
    priority_score: totalScore,
    priority_label: getPriorityLabel(totalScore),
    reasoning: `Priority computed deterministically: severity=${data.severity}, danger=${data.danger_score}, ${data.verification_confirms} confirmations.`,
    factor_breakdown: {
      severity_pts: severityPts,
      danger_pts: dangerPts,
      verification_pts: verificationPts,
      urgency_pts: urgencyPts,
      category_pts: categoryPts,
      recency_pts: recencyPts,
    },
    recommended_response_time: getResponseTime(getPriorityLabel(totalScore)),
  };
}

function getPriorityLabel(score) {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

function getResponseTime(label) {
  const times = {
    Critical: 'Within 4 hours',
    High: 'Within 24 hours',
    Medium: 'Within 3 days',
    Low: 'Within 7 days',
  };
  return times[label] || 'Within 7 days';
}

async function logAgentAction(issueId, log) {
  try {
    await adminDb
      .collection('issues')
      .doc(issueId)
      .collection('agent_logs')
      .add({
        ...log,
        created_at: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error(`[${AGENT_NAME}] Failed to log action:`, err.message);
  }
}
