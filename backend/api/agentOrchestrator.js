/**
 * CivicPulse Agent Orchestrator (Milestone 8)
 * 
 * Event-driven pipeline that chains all 5 agents sequentially:
 * 
 *   IssueCreated
 *       ↓
 *   ┌─────────────────────┐
 *   │ 1. Classification   │  ← Gemini 2.5 Flash
 *   │    Agent             │
 *   └─────────┬───────────┘
 *             ↓
 *   ┌─────────────────────┐
 *   │ 2. Duplicate        │  ← Gemini Embedding
 *   │    Agent             │
 *   └─────────┬───────────┘
 *             ↓
 *   ┌─────────────────────┐
 *   │ 3. Verification     │  ← Pure logic (Haversine)
 *   │    Agent             │
 *   └─────────┬───────────┘
 *             ↓
 *   ┌─────────────────────┐
 *   │ 4. Priority         │  ← Groq Llama 3.3 70B
 *   │    Agent             │
 *   └─────────┬───────────┘
 *             ↓
 *   ┌─────────────────────┐
 *   │ 5. Escalation       │  ← Rules + Groq summaries
 *   │    Agent             │
 *   └─────────────────────┘
 * 
 * Each agent:
 * - Receives the latest issue data (re-fetched between steps)
 * - Logs its execution to issues/{id}/agent_logs subcollection
 * - Updates the issue document with its results
 * - Continues even if a non-critical agent fails
 * 
 * The orchestrator tracks overall pipeline status on the issue document
 * for frontend visualization.
 */

import { runClassificationAgent } from './agents/classificationAgent.js';
import { runDuplicateAgent } from './agents/duplicateAgent.js';
import { runVerificationAgent } from './agents/verificationAgent.js';
import { runPriorityAgent } from './agents/priorityAgent.js';
import { runEscalationAgent } from './agents/escalationAgent.js';
import { adminDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const AGENTS = [
  { name: 'classification_agent', label: 'Classification', fn: runClassificationAgent, critical: true },
  { name: 'duplicate_agent', label: 'Duplicate Detection', fn: runDuplicateAgent, critical: false },
  { name: 'verification_agent', label: 'Verification', fn: runVerificationAgent, critical: false },
  { name: 'priority_agent', label: 'Priority Scoring', fn: runPriorityAgent, critical: false },
  { name: 'escalation_agent', label: 'Escalation Setup', fn: runEscalationAgent, critical: false },
];

/**
 * Process an issue through the full agent pipeline.
 * 
 * @param {string} issueId - Firestore document ID of the issue
 * @returns {object} Pipeline execution results
 */
export async function processIssuePipeline(issueId) {
  const pipelineStart = Date.now();

  // Initialize pipeline status on the issue
  const initialStatus = {
    status: 'processing',
    started_at: new Date().toISOString(),
    current_agent: AGENTS[0].name,
    agents: AGENTS.map(a => ({
      name: a.name,
      label: a.label,
      status: 'pending',
      duration_ms: null,
      error: null,
    })),
  };

  await adminDb.collection('issues').doc(issueId).update({
    agent_pipeline: initialStatus,
    agent_pipeline_updated_at: FieldValue.serverTimestamp(),
  });

  const results = [];
  let pipelineSuccess = true;

  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i];
    const agentStart = Date.now();

    // Update current agent in pipeline status
    try {
      await adminDb.collection('issues').doc(issueId).update({
        'agent_pipeline.current_agent': agent.name,
        [`agent_pipeline.agents.${i}.status`]: 'running',
        agent_pipeline_updated_at: FieldValue.serverTimestamp(),
      });
    } catch (updateErr) {
      console.warn(`Failed to update pipeline status for ${agent.name}:`, updateErr.message);
    }

    console.log(`[Orchestrator] Running ${agent.label} (${i + 1}/${AGENTS.length}) for issue ${issueId}`);

    try {
      // Re-fetch issue data before each agent (gets latest from previous agent)
      const issueSnap = await adminDb.collection('issues').doc(issueId).get();
      if (!issueSnap.exists) {
        throw new Error('Issue not found — may have been deleted during processing');
      }
      const issueData = issueSnap.data();

      // Run the agent
      const result = await agent.fn(issueId, issueData);
      const duration = Date.now() - agentStart;

      results.push({
        agent: agent.name,
        label: agent.label,
        success: result.success,
        duration_ms: duration,
        result: result.result || null,
        error: result.error || null,
        skipped: result.skipped || false,
      });

      // Update pipeline status
      await adminDb.collection('issues').doc(issueId).update({
        [`agent_pipeline.agents.${i}.status`]: result.success ? 'completed' : 'failed',
        [`agent_pipeline.agents.${i}.duration_ms`]: duration,
        [`agent_pipeline.agents.${i}.error`]: result.error || null,
        agent_pipeline_updated_at: FieldValue.serverTimestamp(),
      });

      if (!result.success && agent.critical) {
        console.error(`[Orchestrator] Critical agent ${agent.name} failed. Stopping pipeline.`);
        pipelineSuccess = false;
        break;
      }

      if (!result.success) {
        console.warn(`[Orchestrator] Non-critical agent ${agent.name} failed. Continuing...`);
      }
    } catch (error) {
      const duration = Date.now() - agentStart;
      console.error(`[Orchestrator] Agent ${agent.name} threw:`, error.message);

      results.push({
        agent: agent.name,
        label: agent.label,
        success: false,
        duration_ms: duration,
        error: error.message,
      });

      try {
        await adminDb.collection('issues').doc(issueId).update({
          [`agent_pipeline.agents.${i}.status`]: 'failed',
          [`agent_pipeline.agents.${i}.duration_ms`]: duration,
          [`agent_pipeline.agents.${i}.error`]: error.message,
          agent_pipeline_updated_at: FieldValue.serverTimestamp(),
        });
      } catch (updateErr) {
        // Best effort
      }

      if (agent.critical) {
        pipelineSuccess = false;
        break;
      }
    }
  }

  // Finalize pipeline status
  const totalDuration = Date.now() - pipelineStart;
  const completedCount = results.filter(r => r.success).length;

  try {
    await adminDb.collection('issues').doc(issueId).update({
      'agent_pipeline.status': pipelineSuccess ? 'completed' : 'partial_failure',
      'agent_pipeline.completed_at': new Date().toISOString(),
      'agent_pipeline.total_duration_ms': totalDuration,
      'agent_pipeline.agents_completed': completedCount,
      'agent_pipeline.agents_total': AGENTS.length,
      'agent_pipeline.current_agent': null,
      agent_pipeline_updated_at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('Failed to finalize pipeline status:', err.message);
  }

  console.log(`[Orchestrator] Pipeline ${pipelineSuccess ? 'completed' : 'partial failure'} for issue ${issueId} in ${totalDuration}ms (${completedCount}/${AGENTS.length} agents)`);

  return {
    issue_id: issueId,
    success: pipelineSuccess,
    total_duration_ms: totalDuration,
    agents_completed: completedCount,
    agents_total: AGENTS.length,
    results,
  };
}

/**
 * Get the agent pipeline status and logs for an issue.
 */
export async function getAgentStatus(issueId) {
  const issueSnap = await adminDb.collection('issues').doc(issueId).get();
  if (!issueSnap.exists) {
    throw new Error('Issue not found');
  }

  const issueData = issueSnap.data();
  const pipeline = issueData.agent_pipeline || null;

  // Get agent logs
  const logsSnap = await adminDb
    .collection('issues')
    .doc(issueId)
    .collection('agent_logs')
    .orderBy('created_at', 'asc')
    .get();

  const logs = [];
  logsSnap.forEach((doc) => {
    const data = doc.data();
    logs.push({
      id: doc.id,
      ...data,
      created_at: data.created_at?.toDate?.()?.toISOString() || null,
    });
  });

  return {
    pipeline,
    logs,
    priority_score: issueData.priority_score || null,
    priority_label: issueData.priority_label || null,
    priority_reasoning: issueData.priority_reasoning || null,
    escalation: issueData.escalation || null,
    duplicate_check: issueData.duplicate_check || null,
    recommended_response_time: issueData.recommended_response_time || null,
  };
}
