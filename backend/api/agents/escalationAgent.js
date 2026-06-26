/**
 * Escalation Agent (Milestone 8 — Agent 5)
 * 
 * Trigger: After Priority Agent completes (initial setup)
 *          + Periodic check via /api/agents/escalation-check
 * Model: Deterministic rules + Groq Llama 3.3 70B for summaries
 * 
 * Implements time-based escalation:
 * - Level 0: Just created (0-24h)
 * - Level 1: Ward Officer (24h unresolved)
 * - Level 2: Municipality (72h unresolved)
 * - Level 3: District Officer (7 days unresolved)
 * 
 * Higher priority issues escalate faster:
 * - Critical: times are halved (12h → 36h → 84h)
 * - High: standard times
 * - Medium/Low: times are 1.5x (36h → 108h → 252h)
 * 
 * Also generates escalation summaries via Groq for official notifications.
 */

import { groqFastSummary } from '../groqService.js';
import { createNotification, createBatchNotifications, NOTIFICATION_TYPES } from '../notificationService.js';
import { adminDb } from '../firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const AGENT_NAME = 'escalation_agent';

// Escalation time thresholds in hours (for standard priority)
const ESCALATION_LEVELS = [
  { level: 0, label: 'Reported', hours: 0, authority: 'Community' },
  { level: 1, label: 'Ward Officer', hours: 24, authority: 'Ward Officer' },
  { level: 2, label: 'Municipality', hours: 72, authority: 'Municipal Corporation' },
  { level: 3, label: 'District Officer', hours: 168, authority: 'District Administration' },
];

// Priority multipliers for escalation speed
const PRIORITY_MULTIPLIERS = {
  Critical: 0.5,  // Escalates 2x faster
  High: 1.0,      // Standard
  Medium: 1.5,    // 50% slower
  Low: 2.0,       // 2x slower
};

const ESCALATION_SUMMARY_PROMPT = `You are generating an official escalation notice for a civic issue management platform called CivicPulse AI.

Write a concise, professional escalation summary for government officials. Include:
1. Issue description and severity
2. Time since initial report
3. Reason for escalation
4. Recommended immediate actions
5. Community verification status

Return ONLY valid JSON:
{
  "summary": "Professional 2-3 sentence escalation summary for the authority",
  "action_items": ["Action 1", "Action 2", "Action 3"],
  "urgency_note": "Brief urgency context"
}`;

/**
 * Initial escalation setup when an issue is first created.
 * Sets escalation_level to 0 and records creation time.
 */
export async function runEscalationAgent(issueId, issueData) {
  const startTime = Date.now();
  const log = {
    agent: AGENT_NAME,
    status: 'running',
    started_at: new Date().toISOString(),
  };

  try {
    const priorityLabel = issueData.priority_label || issueData.severity || 'Medium';
    const multiplier = PRIORITY_MULTIPLIERS[priorityLabel] || 1.0;

    // Calculate next escalation times
    const nextEscalation = ESCALATION_LEVELS[1];
    const nextEscalationHours = nextEscalation.hours * multiplier;
    const nextEscalationTime = new Date(Date.now() + nextEscalationHours * 60 * 60 * 1000);

    const escalationData = {
      escalation_level: 0,
      escalation_label: ESCALATION_LEVELS[0].label,
      escalation_authority: ESCALATION_LEVELS[0].authority,
      next_escalation_level: 1,
      next_escalation_at: nextEscalationTime.toISOString(),
      next_escalation_authority: nextEscalation.authority,
      escalation_multiplier: multiplier,
      escalation_history: [{
        level: 0,
        label: 'Reported',
        timestamp: new Date().toISOString(),
        action: 'Issue created and agents processed',
      }],
    };

    await adminDb.collection('issues').doc(issueId).update({
      escalation: escalationData,
      escalation_updated_at: FieldValue.serverTimestamp(),
    });

    log.status = 'completed';
    log.duration_ms = Date.now() - startTime;
    log.result = {
      initial_level: 0,
      next_escalation: `Level 1 (${nextEscalation.authority}) in ${Math.round(nextEscalationHours)}h`,
      priority_multiplier: multiplier,
    };
    await logAgentAction(issueId, log);

    return { success: true, result: escalationData };
  } catch (error) {
    log.status = 'failed';
    log.error = error.message;
    log.duration_ms = Date.now() - startTime;
    await logAgentAction(issueId, log);

    return { success: false, error: error.message };
  }
}

/**
 * Periodic escalation check — scans all open issues and escalates as needed.
 * Called via POST /api/agents/escalation-check
 */
export async function checkAllEscalations() {
  const results = {
    checked: 0,
    escalated: 0,
    details: [],
  };

  try {
    // Get all unresolved issues
    const issuesSnap = await adminDb.collection('issues')
      .where('status', 'not-in', ['Resolved', 'Closed'])
      .get();

    for (const doc of issuesSnap.docs) {
      results.checked++;
      const issueData = doc.data();
      const issueId = doc.id;

      const escalation = issueData.escalation;
      if (!escalation) continue;

      const currentLevel = escalation.escalation_level || 0;
      if (currentLevel >= 3) continue; // Already at max escalation

      const createdAt = issueData.created_at?.toDate
        ? issueData.created_at.toDate()
        : new Date(issueData.created_at || Date.now());
      const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

      const multiplier = escalation.escalation_multiplier || 1.0;
      const nextLevel = currentLevel + 1;
      const nextLevelConfig = ESCALATION_LEVELS[nextLevel];

      if (!nextLevelConfig) continue;

      const thresholdHours = nextLevelConfig.hours * multiplier;

      if (hoursElapsed >= thresholdHours) {
        // ESCALATE!
        results.escalated++;

        // Generate escalation summary via Groq
        let escalationSummary = null;
        try {
          escalationSummary = await groqFastSummary(ESCALATION_SUMMARY_PROMPT, {
            title: issueData.title,
            description: issueData.description,
            category: issueData.category,
            severity: issueData.severity,
            hours_since_report: Math.round(hoursElapsed),
            current_level: currentLevel,
            new_level: nextLevel,
            authority: nextLevelConfig.authority,
            verification_stats: issueData.verification_stats,
            priority_score: issueData.priority_score,
          });
        } catch (err) {
          console.warn(`[${AGENT_NAME}] Groq summary failed:`, err.message);
          escalationSummary = {
            summary: `Issue "${issueData.title}" has been unresolved for ${Math.round(hoursElapsed)} hours. Escalating to ${nextLevelConfig.authority}.`,
            action_items: ['Review issue urgency', 'Assign response team', 'Acknowledge receipt'],
            urgency_note: `This ${issueData.severity} issue requires attention.`,
          };
        }

        // Update escalation data
        const history = escalation.escalation_history || [];
        history.push({
          level: nextLevel,
          label: nextLevelConfig.label,
          authority: nextLevelConfig.authority,
          timestamp: new Date().toISOString(),
          action: `Auto-escalated after ${Math.round(hoursElapsed)} hours unresolved`,
          summary: escalationSummary?.summary,
        });

        // Determine next-next escalation
        const futureLevel = nextLevel + 1;
        const futureLevelConfig = ESCALATION_LEVELS[futureLevel];

        await adminDb.collection('issues').doc(issueId).update({
          escalation: {
            ...escalation,
            escalation_level: nextLevel,
            escalation_label: nextLevelConfig.label,
            escalation_authority: nextLevelConfig.authority,
            next_escalation_level: futureLevelConfig ? futureLevel : null,
            next_escalation_at: futureLevelConfig 
              ? new Date(createdAt.getTime() + futureLevelConfig.hours * multiplier * 60 * 60 * 1000).toISOString()
              : null,
            next_escalation_authority: futureLevelConfig?.authority || null,
            escalation_history: history,
            last_escalation_summary: escalationSummary,
          },
          escalation_updated_at: FieldValue.serverTimestamp(),
        });

        // Notify the issue reporter about escalation
        await createNotification(
          issueData.reporter_id,
          NOTIFICATION_TYPES.ISSUE_STATUS_CHANGED,
          {
            title: `⬆️ Issue Escalated to ${nextLevelConfig.authority}`,
            message: escalationSummary?.summary || `Your issue "${issueData.title}" has been escalated.`,
            issue_id: issueId,
          }
        );

        results.details.push({
          issue_id: issueId,
          title: issueData.title,
          from_level: currentLevel,
          to_level: nextLevel,
          authority: nextLevelConfig.authority,
          hours_elapsed: Math.round(hoursElapsed),
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`[${AGENT_NAME}] Escalation check failed:`, error.message);
    return { ...results, error: error.message };
  }
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
