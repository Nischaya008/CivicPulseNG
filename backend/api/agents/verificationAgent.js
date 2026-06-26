/**
 * Verification Agent (Milestone 8 — Agent 3)
 * 
 * Trigger: After Duplicate Agent completes
 * Model: Pure code logic (no AI needed — deterministic)
 * 
 * Selects nearby users who can verify the reported issue:
 * 1. Finds users within configurable radius (default 5km)
 * 2. Filters out the reporter themselves
 * 3. Prioritizes users with higher trust scores
 * 4. Sends verification request notifications to selected verifiers
 * 
 * In a real-world city deployment, this uses Haversine distance
 * to find genuinely nearby citizens who can physically verify.
 */

import { findNearbyVerifiers } from '../verificationService.js';
import { createBatchNotifications, NOTIFICATION_TYPES } from '../notificationService.js';
import { adminDb } from '../firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const AGENT_NAME = 'verification_agent';
const DEFAULT_RADIUS_KM = 5;
const MAX_VERIFIERS = 10;

export async function runVerificationAgent(issueId, issueData) {
  const startTime = Date.now();
  const log = {
    agent: AGENT_NAME,
    status: 'running',
    started_at: new Date().toISOString(),
  };

  try {
    const lat = issueData.lat;
    const lng = issueData.lng;

    if (!lat || !lng) {
      log.status = 'skipped';
      log.reason = 'No location data on issue';
      log.duration_ms = Date.now() - startTime;
      await logAgentAction(issueId, log);
      return { success: true, skipped: true, reason: 'No location data' };
    }

    // Find nearby users who could verify
    const nearbyUsers = await findNearbyVerifiers(issueId, lat, lng, DEFAULT_RADIUS_KM);

    // Sort by trust score (prioritize high-trust verifiers)
    // We need to fetch trust scores for sorting
    const usersWithTrust = [];
    for (const user of nearbyUsers) {
      try {
        const userDoc = await adminDb.collection('users').doc(user.user_id).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        usersWithTrust.push({
          ...user,
          trust_score: userData.trust_score || 50,
          points: userData.points || 0,
        });
      } catch {
        usersWithTrust.push({ ...user, trust_score: 50, points: 0 });
      }
    }

    // Sort: higher trust score first, then by distance (closer first)
    usersWithTrust.sort((a, b) => {
      if (b.trust_score !== a.trust_score) return b.trust_score - a.trust_score;
      return a.distance - b.distance;
    });

    // Select top verifiers
    const selectedVerifiers = usersWithTrust.slice(0, MAX_VERIFIERS);

    // Send verification request notifications
    if (selectedVerifiers.length > 0) {
      const verifierIds = selectedVerifiers.map(v => v.user_id);
      
      await createBatchNotifications(
        verifierIds,
        NOTIFICATION_TYPES.VERIFICATION_REQUEST,
        {
          title: '🔍 Verification Request',
          message: `Can you verify this ${issueData.category || 'civic'} issue near you? "${issueData.title}"`,
          issue_id: issueId,
          actor_name: 'CivicPulse AI',
          metadata: {
            category: issueData.category,
            severity: issueData.severity,
            address: issueData.address,
            distance_info: selectedVerifiers.map(v => ({
              user_id: v.user_id,
              distance_km: v.distance,
            })),
          },
        }
      );
    }

    const result = {
      nearby_users_found: nearbyUsers.length,
      verifiers_selected: selectedVerifiers.length,
      verifiers: selectedVerifiers.map(v => ({
        user_id: v.user_id,
        name: v.name,
        distance_km: v.distance,
        trust_score: v.trust_score,
      })),
      notifications_sent: selectedVerifiers.length,
      radius_km: DEFAULT_RADIUS_KM,
    };

    // Update issue with verification assignment data
    await adminDb.collection('issues').doc(issueId).update({
      verification_assigned: true,
      verification_assigned_at: FieldValue.serverTimestamp(),
      assigned_verifiers: selectedVerifiers.map(v => v.user_id),
    });

    log.status = 'completed';
    log.duration_ms = Date.now() - startTime;
    log.result = {
      nearby_found: result.nearby_users_found,
      selected: result.verifiers_selected,
      notifications_sent: result.notifications_sent,
    };
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
