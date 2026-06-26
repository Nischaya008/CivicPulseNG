/**
 * Classification Agent (Milestone 8 — Agent 1)
 * 
 * Trigger: IssueCreated event
 * Model: Gemini 2.5 Flash (multimodal, fast, proven in M3)
 * 
 * Automatically classifies new issues with:
 * - Category (from 11 civic issue types)
 * - Severity (Critical/High/Medium/Low)
 * - Urgency rating (1-10)
 * - Confidence score
 * - Recommended action for authorities
 * 
 * This agent wraps the existing analyzeIssue() from aiService.js
 * with additional agent-level logging and urgency computation.
 */

import { analyzeIssue } from '../aiService.js';
import { adminDb } from '../firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';

const AGENT_NAME = 'classification_agent';

/**
 * Run classification on an issue.
 * If the issue already has AI analysis data, re-use it; otherwise run fresh.
 */
export async function runClassificationAgent(issueId, issueData) {
  const startTime = Date.now();
  const log = {
    agent: AGENT_NAME,
    status: 'running',
    started_at: new Date().toISOString(),
  };

  try {
    let analysis;

    // If AI already analyzed during creation (M3.4 auto-fill), re-use that data
    if (issueData.ai_analysis && issueData.ai_analysis.category) {
      analysis = issueData.ai_analysis;
      log.source = 'cached_from_creation';
    } else {
      // Run fresh analysis
      const imagePath = issueData.media_urls?.[0] || null;
      const textDescription = `${issueData.title || ''}\n${issueData.description || ''}`;

      // Check if imagePath is a URL (from upload) or local path
      let localImagePath = null;
      if (imagePath && !imagePath.startsWith('http')) {
        localImagePath = imagePath;
      }

      analysis = await analyzeIssue(localImagePath, textDescription);
      log.source = 'fresh_analysis';
    }

    // Compute urgency score (1-10) from severity and danger_score
    const severityWeights = { Critical: 10, High: 7, Medium: 4, Low: 2 };
    const severityWeight = severityWeights[analysis.severity] || 5;
    const dangerScore = parseFloat(analysis.danger_score) || 5;
    const urgency = Math.round((severityWeight * 0.6 + dangerScore * 0.4) * 10) / 10;

    const result = {
      category: analysis.category || issueData.category || 'Other',
      severity: analysis.severity || issueData.severity || 'Medium',
      confidence: parseFloat(analysis.confidence) || 0.5,
      danger_score: parseFloat(analysis.danger_score) || 5.0,
      urgency,
      recommended_action: analysis.recommended_action || 'Review required',
      ai_title: analysis.title || issueData.title,
      ai_description: analysis.description || issueData.description,
    };

    // Update the issue with classification results
    const updateData = {
      category: result.category,
      severity: result.severity,
      ai_analysis: result,
      ai_classified: true,
      ai_classified_at: FieldValue.serverTimestamp(),
    };

    await adminDb.collection('issues').doc(issueId).update(updateData);

    // Log agent result
    log.status = 'completed';
    log.duration_ms = Date.now() - startTime;
    log.result = result;
    await logAgentAction(issueId, log);

    return { success: true, result };
  } catch (error) {
    log.status = 'failed';
    log.error = error.message;
    log.duration_ms = Date.now() - startTime;
    await logAgentAction(issueId, log);

    return { success: false, error: error.message };
  }
}

/**
 * Log agent action to Firestore subcollection
 */
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
