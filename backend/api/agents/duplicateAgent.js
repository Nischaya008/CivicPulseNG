/**
 * Duplicate Agent (Milestone 8 — Agent 2)
 * 
 * Trigger: After Classification Agent completes
 * Model: Gemini Embedding (gemini-embedding-001)
 * 
 * Checks new issues against existing issues using:
 * 1. Text embedding cosine similarity (threshold: 0.85)
 * 2. Location proximity (within 500m of existing issues with same category)
 * 3. Temporal proximity (reported within 48 hours of each other)
 * 
 * Multi-signal scoring gives much better real-world duplicate detection
 * than embedding alone — prevents false positives from generic descriptions.
 */

import { generateEmbedding, cosineSimilarity } from '../aiService.js';
import { adminDb } from '../firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const AGENT_NAME = 'duplicate_agent';
const EMBEDDING_SIMILARITY_THRESHOLD = 0.82;
const LOCATION_PROXIMITY_KM = 0.5; // 500 meters
const TIME_WINDOW_HOURS = 48;

/**
 * Haversine distance between two lat/lng points in km
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function runDuplicateAgent(issueId, issueData) {
  const startTime = Date.now();
  const log = {
    agent: AGENT_NAME,
    status: 'running',
    started_at: new Date().toISOString(),
  };

  try {
    // Generate embedding for the new issue
    const issueText = `${issueData.title || ''} ${issueData.description || ''} ${issueData.category || ''}`;
    const newEmbedding = await generateEmbedding(issueText);

    // Fetch all existing issues (excluding current)
    const issuesSnap = await adminDb.collection('issues').get();
    const candidates = [];

    const issueCreatedAt = issueData.created_at?.toDate
      ? issueData.created_at.toDate()
      : new Date(issueData.created_at || Date.now());

    issuesSnap.forEach((doc) => {
      if (doc.id === issueId) return; // Skip self
      const data = doc.data();
      candidates.push({ id: doc.id, ...data });
    });

    const duplicates = [];

    for (const candidate of candidates) {
      let score = 0;
      const signals = {};

      // Signal 1: Embedding similarity
      if (candidate.embedding && candidate.embedding.length > 0) {
        const similarity = cosineSimilarity(newEmbedding, candidate.embedding);
        signals.embedding_similarity = Math.round(similarity * 100) / 100;
        if (similarity >= EMBEDDING_SIMILARITY_THRESHOLD) {
          score += similarity * 50; // Up to 50 points
        }
      }

      // Signal 2: Location proximity
      if (issueData.lat && issueData.lng && candidate.lat && candidate.lng) {
        const distance = haversineDistance(
          issueData.lat, issueData.lng,
          candidate.lat, candidate.lng
        );
        signals.distance_km = Math.round(distance * 100) / 100;
        if (distance <= LOCATION_PROXIMITY_KM) {
          score += (1 - distance / LOCATION_PROXIMITY_KM) * 25; // Up to 25 points
        }
      }

      // Signal 3: Same category
      if (issueData.category && candidate.category === issueData.category) {
        signals.same_category = true;
        score += 15; // 15 points for same category
      }

      // Signal 4: Temporal proximity
      const candidateCreatedAt = candidate.created_at?.toDate
        ? candidate.created_at.toDate()
        : new Date(candidate.created_at || 0);
      const hoursDiff = Math.abs(issueCreatedAt - candidateCreatedAt) / (1000 * 60 * 60);
      signals.hours_apart = Math.round(hoursDiff * 10) / 10;
      if (hoursDiff <= TIME_WINDOW_HOURS) {
        score += (1 - hoursDiff / TIME_WINDOW_HOURS) * 10; // Up to 10 points
      }

      // Composite score normalization (0-100)
      const normalizedScore = Math.min(100, Math.round(score));

      if (normalizedScore >= 50) {
        duplicates.push({
          issue_id: candidate.id,
          title: candidate.title,
          category: candidate.category,
          status: candidate.status,
          duplicate_score: normalizedScore,
          signals,
        });
      }
    }

    // Sort by score descending
    duplicates.sort((a, b) => b.duplicate_score - a.duplicate_score);
    const topDuplicates = duplicates.slice(0, 5);

    const result = {
      is_likely_duplicate: topDuplicates.length > 0 && topDuplicates[0].duplicate_score >= 70,
      duplicate_count: topDuplicates.length,
      duplicates: topDuplicates,
      best_match: topDuplicates[0] || null,
    };

    // Store embedding and duplicate results on the issue
    await adminDb.collection('issues').doc(issueId).update({
      embedding: newEmbedding,
      duplicate_check: result,
      duplicate_checked_at: FieldValue.serverTimestamp(),
    });

    log.status = 'completed';
    log.duration_ms = Date.now() - startTime;
    log.result = {
      duplicates_found: topDuplicates.length,
      is_likely_duplicate: result.is_likely_duplicate,
      best_match_score: topDuplicates[0]?.duplicate_score || 0,
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
