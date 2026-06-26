/**
 * CivicPulse Notification Service (Milestone 5)
 * 
 * Creates and manages notifications for realtime events.
 * Uses Firebase Admin for server-side writes to the notifications collection.
 */

import { adminDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = {
  ISSUE_CREATED: 'issue_created',
  ISSUE_VERIFIED: 'issue_verified',
  ISSUE_STATUS_CHANGED: 'issue_status_changed',
  COMMENT_ADDED: 'comment_added',
  VERIFICATION_REQUEST: 'verification_request',
  BADGE_EARNED: 'badge_earned',
  POINTS_EARNED: 'points_earned',
  DUPLICATE_DETECTED: 'duplicate_detected',
};

/**
 * Create a notification for a specific user
 */
export async function createNotification(userId, type, data = {}) {
  if (!adminDb) {
    console.warn('Firebase Admin not initialized — notification skipped');
    return null;
  }

  const notification = {
    user_id: userId,
    type,
    title: data.title || getDefaultTitle(type),
    message: data.message || '',
    issue_id: data.issue_id || null,
    actor_id: data.actor_id || null,
    actor_name: data.actor_name || null,
    read: false,
    created_at: FieldValue.serverTimestamp(),
    metadata: data.metadata || {},
  };

  const docRef = await adminDb.collection('notifications').add(notification);
  return { id: docRef.id, ...notification };
}

/**
 * Create notifications for multiple users (batch)
 */
export async function createBatchNotifications(userIds, type, data = {}) {
  if (!adminDb || !userIds || userIds.length === 0) return [];

  const batch = adminDb.batch();
  const notifications = [];

  for (const userId of userIds) {
    const docRef = adminDb.collection('notifications').doc();
    const notification = {
      user_id: userId,
      type,
      title: data.title || getDefaultTitle(type),
      message: data.message || '',
      issue_id: data.issue_id || null,
      actor_id: data.actor_id || null,
      actor_name: data.actor_name || null,
      read: false,
      created_at: FieldValue.serverTimestamp(),
      metadata: data.metadata || {},
    };

    batch.set(docRef, notification);
    notifications.push({ id: docRef.id, ...notification });
  }

  await batch.commit();
  return notifications;
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(notificationIds) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const batch = adminDb.batch();

  for (const id of notificationIds) {
    const ref = adminDb.collection('notifications').doc(id);
    batch.update(ref, { read: true, read_at: FieldValue.serverTimestamp() });
  }

  await batch.commit();
  return { updated: notificationIds.length };
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllRead(userId) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const unreadSnap = await adminDb
    .collection('notifications')
    .where('user_id', '==', userId)
    .where('read', '==', false)
    .get();

  if (unreadSnap.empty) return { updated: 0 };

  const batch = adminDb.batch();
  unreadSnap.forEach((doc) => {
    batch.update(doc.ref, { read: true, read_at: FieldValue.serverTimestamp() });
  });

  await batch.commit();
  return { updated: unreadSnap.size };
}

/**
 * Get notifications for a user with pagination
 */
export async function getUserNotifications(userId, limitCount = 50, lastDocId = null) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  let q = adminDb
    .collection('notifications')
    .where('user_id', '==', userId)
    .orderBy('created_at', 'desc')
    .limit(limitCount);

  if (lastDocId) {
    const lastDoc = await adminDb.collection('notifications').doc(lastDocId).get();
    if (lastDoc.exists) {
      q = q.startAfter(lastDoc);
    }
  }

  const snap = await q.get();
  const notifications = [];
  snap.forEach((doc) => {
    notifications.push({ id: doc.id, ...doc.data() });
  });

  // Get unread count
  const unreadSnap = await adminDb
    .collection('notifications')
    .where('user_id', '==', userId)
    .where('read', '==', false)
    .get();

  return {
    notifications,
    unread_count: unreadSnap.size,
    has_more: notifications.length === limitCount,
  };
}

/**
 * Create notification when an issue is created — notify nearby users
 */
export async function notifyIssueCreated(issue, reporterName) {
  if (!adminDb) return;

  // Get all users to find nearby ones (in production, use geohash queries)
  const usersSnap = await adminDb.collection('users').get();
  const nearbyUserIds = [];

  usersSnap.forEach((doc) => {
    if (doc.id === issue.reporter_id) return; // Skip reporter
    // For now, notify all users (in production, filter by proximity)
    nearbyUserIds.push(doc.id);
  });

  if (nearbyUserIds.length > 0) {
    await createBatchNotifications(nearbyUserIds, NOTIFICATION_TYPES.ISSUE_CREATED, {
      title: 'New Issue Reported',
      message: `${reporterName || 'Someone'} reported: "${issue.title}"`,
      issue_id: issue.id,
      actor_id: issue.reporter_id,
      actor_name: reporterName,
      metadata: {
        category: issue.category,
        severity: issue.severity,
        address: issue.address,
      },
    });
  }
}

/**
 * Create notification when issue is verified
 */
export async function notifyIssueVerified(issueId, issueTitle, verifierName, reporterId) {
  if (!adminDb) return;

  await createNotification(reporterId, NOTIFICATION_TYPES.ISSUE_VERIFIED, {
    title: 'Issue Verified',
    message: `${verifierName || 'A community member'} verified your issue: "${issueTitle}"`,
    issue_id: issueId,
    actor_name: verifierName,
  });
}

/**
 * Create notification for comment on an issue
 */
export async function notifyCommentAdded(issueId, issueTitle, commenterName, reporterId) {
  if (!adminDb) return;

  await createNotification(reporterId, NOTIFICATION_TYPES.COMMENT_ADDED, {
    title: 'New Comment',
    message: `${commenterName || 'Someone'} commented on: "${issueTitle}"`,
    issue_id: issueId,
    actor_name: commenterName,
  });
}

/**
 * Default notification titles by type
 */
function getDefaultTitle(type) {
  const titles = {
    [NOTIFICATION_TYPES.ISSUE_CREATED]: 'New Issue Reported',
    [NOTIFICATION_TYPES.ISSUE_VERIFIED]: 'Issue Verified',
    [NOTIFICATION_TYPES.ISSUE_STATUS_CHANGED]: 'Issue Status Updated',
    [NOTIFICATION_TYPES.COMMENT_ADDED]: 'New Comment',
    [NOTIFICATION_TYPES.VERIFICATION_REQUEST]: 'Verification Request',
    [NOTIFICATION_TYPES.BADGE_EARNED]: 'Badge Earned!',
    [NOTIFICATION_TYPES.POINTS_EARNED]: 'Points Earned',
    [NOTIFICATION_TYPES.DUPLICATE_DETECTED]: 'Duplicate Detected',
  };
  return titles[type] || 'Notification';
}
