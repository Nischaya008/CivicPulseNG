/**
 * CivicPulse Verification Service (Milestone 4)
 * 
 * Handles community verification voting, trust scoring,
 * confidence aggregation, and evidence uploads.
 */

import { adminDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const VERIFICATION_THRESHOLD_VOTES = 3;
const VERIFICATION_CONFIDENCE_MIN = 0.7;
const NEARBY_RADIUS_KM = 5;

/**
 * Haversine distance between two lat/lng points in km
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Submit or update a verification vote
 */
export async function submitVote(issueId, userId, vote, confidence, comment = '') {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  // Fetch the issue to prevent self-verification
  const issueRef = adminDb.collection('issues').doc(issueId);
  const issueSnap = await issueRef.get();
  
  if (!issueSnap.exists) {
    throw new Error('Issue not found');
  }

  const issueData = issueSnap.data();
  if (issueData.reporter_id === userId) {
    throw new Error('You cannot verify your own issue');
  }

  // Validate vote value
  const validVotes = ['confirm', 'reject', 'need_evidence'];
  if (!validVotes.includes(vote)) {
    throw new Error(`Invalid vote. Must be one of: ${validVotes.join(', ')}`);
  }

  // Validate confidence (0.0 to 1.0)
  const normalizedConfidence = Math.max(0, Math.min(1, parseFloat(confidence) || 0.5));

  // Upsert vote (one vote per user per issue)
  const voteRef = adminDb
    .collection('issues')
    .doc(issueId)
    .collection('verification_votes')
    .doc(userId);

  const existingVote = await voteRef.get();
  const isUpdate = existingVote.exists;

  // Fetch user trust score to weight the vote
  let trustWeight = 0.5; // default for new users
  try {
    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (userSnap.exists) {
      const ts = userSnap.data().trust_score;
      if (typeof ts === 'number') {
        trustWeight = ts / 100;
      }
    }
  } catch (err) { /* ignore */ }

  await voteRef.set({
    issue_id: issueId,
    user_id: userId,
    vote,
    confidence: normalizedConfidence,
    trust_weight: trustWeight,
    comment,
    created_at: isUpdate ? existingVote.data().created_at : FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  // Track verification count on user profile to avoid collectionGroup queries
  if (!isUpdate) {
    try {
      await adminDb.collection('users').doc(userId).update({
        verification_count: FieldValue.increment(1)
      });
    } catch (err) { /* ignore if user doc not found */ }
  }

  // Recalculate aggregated verification stats
  const stats = await recalculateVerificationStats(issueId);

  // Auto-promote issue status if threshold met
  if (
    stats.confirm_count >= VERIFICATION_THRESHOLD_VOTES &&
    stats.confidence >= VERIFICATION_CONFIDENCE_MIN &&
    issueData.status !== 'Community Verified' &&
    issueData.status !== 'In Progress' &&
    issueData.status !== 'Resolved' &&
    issueData.status !== 'Closed'
  ) {
    await issueRef.update({
      status: 'Community Verified',
      verification_stats: stats,
      verified_at: FieldValue.serverTimestamp(),
    });
    stats.status_changed = true;
  } else {
    await issueRef.update({ verification_stats: stats });
  }

  // Award points for verification
  await awardVerificationPoints(userId, vote);

  return {
    success: true,
    is_update: isUpdate,
    stats,
  };
}

/**
 * Recalculate aggregated verification statistics for an issue
 */
async function recalculateVerificationStats(issueId) {
  const votesSnap = await adminDb
    .collection('issues')
    .doc(issueId)
    .collection('verification_votes')
    .get();

  let confirm_weight = 0;
  let reject_weight = 0;
  let need_evidence_weight = 0;
  let total_weight = 0;
  let weighted_score = 0;
  
  let confirm_count = 0;
  let reject_count = 0;
  let need_evidence_count = 0;

  const votes = [];

  votesSnap.forEach((doc) => {
    const v = doc.data();
    votes.push(v);

    const userWeight = v.trust_weight || 0.5; // fallback weight
    const voteWeight = v.confidence * userWeight;

    if (v.vote === 'confirm') {
      confirm_count++;
      confirm_weight += userWeight;
      weighted_score += voteWeight;
    } else if (v.vote === 'reject') {
      reject_count++;
      reject_weight += userWeight;
      weighted_score -= voteWeight;
    } else {
      need_evidence_count++;
      need_evidence_weight += userWeight;
    }
    total_weight += userWeight;
  });

  const total_votes = votes.length;
  // Normalized between -1 and 1, then mapped to 0 to 1
  const community_score = total_weight > 0 ? Math.max(0, Math.min(1, (weighted_score / total_weight + 1) / 2)) : 0;
  // Raw confidence is just how confident the voters felt on average
  const avg_confidence = total_votes > 0 ? votes.reduce((sum, v) => sum + v.confidence, 0) / total_votes : 0;

  return {
    total_votes,
    confirm_count,
    reject_count,
    need_evidence_count,
    confidence: Math.round(avg_confidence * 100) / 100,
    community_score: Math.round(community_score * 100) / 100,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Get verification data for an issue
 */
export async function getVerification(issueId) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const issueRef = adminDb.collection('issues').doc(issueId);
  const issueSnap = await issueRef.get();

  if (!issueSnap.exists) {
    throw new Error('Issue not found');
  }

  const votesSnap = await issueRef
    .collection('verification_votes')
    .orderBy('created_at', 'desc')
    .get();

  const votes = [];
  votesSnap.forEach((doc) => {
    votes.push({ id: doc.id, ...doc.data() });
  });

  const stats = issueSnap.data().verification_stats || await recalculateVerificationStats(issueId);

  return { stats, votes };
}

/**
 * Check if user has already voted on an issue
 */
export async function getUserVote(issueId, userId) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const voteRef = adminDb
    .collection('issues')
    .doc(issueId)
    .collection('verification_votes')
    .doc(userId);

  const voteSnap = await voteRef.get();
  return voteSnap.exists ? voteSnap.data() : null;
}

/**
 * Upload evidence for verification (stores metadata in Firestore)
 */
export async function addEvidence(issueId, userId, mediaUrl, description = '') {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const evidenceRef = adminDb
    .collection('issues')
    .doc(issueId)
    .collection('evidence')
    .doc();

  await evidenceRef.set({
    issue_id: issueId,
    user_id: userId,
    media_url: mediaUrl,
    description,
    created_at: FieldValue.serverTimestamp(),
  });

  return { id: evidenceRef.id, success: true };
}

/**
 * Get all evidence for an issue
 */
export async function getEvidence(issueId) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const evidenceSnap = await adminDb
    .collection('issues')
    .doc(issueId)
    .collection('evidence')
    .orderBy('created_at', 'desc')
    .get();

  const evidence = [];
  evidenceSnap.forEach((doc) => {
    evidence.push({ id: doc.id, ...doc.data() });
  });

  return evidence;
}

/**
 * Calculate trust score for a user
 * Formula: (correct_verifications * 2 + resolved_reports * 3 + activity_bonus) / normalization
 */
export async function calculateTrustScore(userId) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  // Count total verifications by this user
  const userVotesSnap = await adminDb
    .collectionGroup('verification_votes')
    .where('user_id', '==', userId)
    .get();

  let totalVotes = 0;
  let correctVotes = 0;

  for (const voteDoc of userVotesSnap.docs) {
    totalVotes++;
    const voteData = voteDoc.data();
    
    // Get parent issue to check if the vote aligned with consensus
    const issueId = voteDoc.ref.parent.parent.id;
    const issueSnap = await adminDb.collection('issues').doc(issueId).get();
    
    if (issueSnap.exists) {
      const issueData = issueSnap.data();
      const stats = issueData.verification_stats;
      
      if (stats && stats.total_votes >= VERIFICATION_THRESHOLD_VOTES) {
        const consensus = stats.confirm_count > stats.reject_count ? 'confirm' : 'reject';
        if (voteData.vote === consensus) {
          correctVotes++;
        }
      }
    }
  }

  // Count resolved reports by this user
  const resolvedSnap = await adminDb
    .collection('issues')
    .where('reporter_id', '==', userId)
    .where('status', 'in', ['Resolved', 'Closed', 'Community Verified'])
    .get();
  const resolvedCount = resolvedSnap.size;

  // Count total reports by this user
  const totalReportsSnap = await adminDb
    .collection('issues')
    .where('reporter_id', '==', userId)
    .get();
  const totalReports = totalReportsSnap.size;

  // Calculate score components using robust mathematical models

  // 1. Bayesian Verification Accuracy (Max 40 points)
  // New users start with a prior of 0.5 (e.g. 2 correct out of 4)
  const priorCorrect = 2;
  const priorTotal = 4;
  const bayesianAccuracy = (correctVotes + priorCorrect) / (totalVotes + priorTotal);
  const verificationScore = bayesianAccuracy * 40; 

  // 2. Reporting Track Record (Max 30 points)
  // Uses an exponential asymptotic curve so that the first few resolved issues give more points, 
  // but it becomes harder to max out.
  const reportingScore = (1 - Math.exp(-resolvedCount / 10)) * 30; 

  // 3. Overall Activity (Max 20 points)
  // Rewards general participation (reports + votes)
  const activityScore = (1 - Math.exp(-(totalVotes + totalReports) / 20)) * 20; 

  // 4. Base Score (10 points)
  const baseScore = 10; 

  const trustScore = Math.round(Math.min(100, baseScore + verificationScore + reportingScore + activityScore));

  // Update user document
  await adminDb.collection('users').doc(userId).update({
    trust_score: trustScore,
    verification_stats: {
      total_votes: totalVotes,
      correct_votes: correctVotes,
      accuracy: Math.round(bayesianAccuracy * 100) / 100,
      total_reports: totalReports,
      resolved_reports: resolvedCount,
    },
    trust_updated_at: FieldValue.serverTimestamp(),
  });

  return { trust_score: trustScore, totalVotes, correctVotes, resolvedCount, totalReports };
}

/**
 * Award points to user for verification actions
 */
async function awardVerificationPoints(userId, voteType) {
  if (!adminDb) return;

  const points = voteType === 'confirm' || voteType === 'reject' ? 5 : 2;

  const userRef = adminDb.collection('users').doc(userId);
  
  try {
    await userRef.update({
      points: FieldValue.increment(points),
    });
  } catch (err) {
    // User doc might not have points field yet
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const userData = userSnap.data();
      await userRef.update({ points: (userData.points || 0) + points });
    }
  }
}

/**
 * Find nearby users who could verify an issue
 */
export async function findNearbyVerifiers(issueId, reporterLat, reporterLng, radiusKm = NEARBY_RADIUS_KM) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  // Get all users with location data
  const usersSnap = await adminDb.collection('users').get();
  const nearbyUsers = [];

  const issueSnap = await adminDb.collection('issues').doc(issueId).get();
  const reporterId = issueSnap.exists ? issueSnap.data().reporter_id : null;

  usersSnap.forEach((doc) => {
    const user = doc.data();
    // Skip the reporter themselves
    if (doc.id === reporterId) return;
    
    if (user.lat && user.lng) {
      const distance = haversineDistance(reporterLat, reporterLng, user.lat, user.lng);
      if (distance <= radiusKm) {
        nearbyUsers.push({
          user_id: doc.id,
          name: user.name,
          distance: Math.round(distance * 10) / 10,
        });
      }
    }
  });

  return nearbyUsers;
}
