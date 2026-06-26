import { adminDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from './notificationService.js';

// Base points schema
export const POINTS_SCHEMA = {
  report: 10,
  verify: 5,
  resolve: 20,
  comment: 2,
};

// Severity multipliers for reporting and resolving
const SEVERITY_MULTIPLIER = {
  Critical: 2.5,
  High: 1.5,
  Medium: 1.0,
  Low: 0.5,
};

const DAILY_LIMIT = 50;

// Level thresholds
export const LEVELS = [
  { level: 1, minPoints: 0, title: 'Novice Reporter' },
  { level: 2, minPoints: 50, title: 'Active Citizen' },
  { level: 3, minPoints: 150, title: 'Civic Leader' },
  { level: 4, minPoints: 300, title: 'Neighborhood Watch' },
  { level: 5, minPoints: 600, title: 'City Guardian' },
  { level: 6, minPoints: 1000, title: 'Pulse Master' },
];

// Badges logic
export const BADGES = [
  {
    id: 'community_hero',
    name: 'Community Hero',
    description: 'Reached 500 points or resolved 10 issues',
    icon: '🦸‍♂️',
  },
  {
    id: 'road_guardian',
    name: 'Road Guardian',
    description: 'Reported 5+ road damage issues',
    icon: '🛣️',
  },
  {
    id: 'top_verifier',
    name: 'Top Verifier',
    description: 'Verified 10+ issues',
    icon: '✅',
  },
];

/**
 * Calculate the user's level based on points
 */
export function calculateLevel(points) {
  let currentLevel = LEVELS[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].minPoints) {
      currentLevel = LEVELS[i];
    } else {
      break;
    }
  }
  
  const nextLevel = LEVELS.find(l => l.level === currentLevel.level + 1);
  const progressToNext = nextLevel
    ? Math.max(0, Math.min(100, ((points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100))
    : 100;

  return {
    ...currentLevel,
    progress: progressToNext,
    nextLevelPoints: nextLevel ? nextLevel.minPoints : null,
  };
}

/**
 * Award points to a user for an action with dynamic calculations and anti-spam limits
 */
export async function awardPoints(userId, actionType, issueId = null) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  let basePoints = POINTS_SCHEMA[actionType];
  if (basePoints === undefined) throw new Error(`Invalid actionType: ${actionType}`);

  let finalPoints = basePoints;

  try {
    // Check if issue exists to get severity multiplier
    if (issueId && (actionType === 'report' || actionType === 'resolve' || actionType === 'verify')) {
      const issueRef = adminDb.collection('issues').doc(issueId);
      const issueSnap = await issueRef.get();
      if (issueSnap.exists) {
        const severity = issueSnap.data().severity;
        if (severity && SEVERITY_MULTIPLIER[severity]) {
          finalPoints = Math.round(basePoints * SEVERITY_MULTIPLIER[severity]);
        }
      }
    }

    const userRef = adminDb.collection('users').doc(userId);
    let awarded = 0;
    
    await adminDb.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) return;

      const userData = userDoc.data();
      const oldPoints = userData.points || 0;
      const today = new Date().toISOString().split('T')[0];
      
      let dailyPoints = userData.daily_points || 0;
      let lastActionDate = userData.last_action_date || '';

      // Reset daily points if it's a new day
      if (lastActionDate !== today) {
        dailyPoints = 0;
      }

      // Check daily limit for anti-spam
      if (dailyPoints + finalPoints > DAILY_LIMIT && actionType !== 'resolve') {
        // Allow up to the limit
        finalPoints = Math.max(0, DAILY_LIMIT - dailyPoints);
      }

      if (finalPoints === 0) {
        awarded = 0;
        return; // Hit the limit
      }

      const newPoints = oldPoints + finalPoints;
      dailyPoints += finalPoints;

      const oldLevel = calculateLevel(oldPoints);
      const newLevel = calculateLevel(newPoints);

      t.update(userRef, {
        points: newPoints,
        daily_points: dailyPoints,
        last_action_date: today
      });

      awarded = finalPoints;

      // Notification for level up
      if (newLevel.level > oldLevel.level) {
        createNotification(userId, 'badge_earned', {
          title: `Leveled Up! 🎉`,
          message: `You are now a Level ${newLevel.level} ${newLevel.title}`,
          metadata: { level: newLevel.level, title: newLevel.title }
        }).catch(err => console.error('Failed to notify level up:', err));
      }
    });

    if (awarded > 0) {
      await checkAndGrantBadges(userId);
    }

    return { success: true, awarded };
  } catch (err) {
    console.error('Error awarding points:', err);
    throw err;
  }
}

/**
 * Check if the user qualifies for any new badges and grant them
 */
export async function checkAndGrantBadges(userId) {
  if (!adminDb) return;

  const userRef = adminDb.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) return;
  
  const userData = userSnap.data();
  const currentBadges = userData.badges || [];
  const points = userData.points || 0;
  
  const newBadges = [];

  // Query issues to check for specific criteria
  const issuesReportedSnap = await adminDb.collection('issues').where('reporter_id', '==', userId).get();
  let roadDamageCount = 0;
  let resolvedCount = 0;

  issuesReportedSnap.forEach(doc => {
    const data = doc.data();
    if (data.category === 'Road Damage') roadDamageCount++;
    if (data.status === 'Resolved' || data.status === 'Closed') resolvedCount++;
  });

  // Use pre-aggregated count from the user profile instead of a collectionGroup query
  const verificationsCount = userData.verification_count || 0;

  // 1. Community Hero: 500 points OR 10 resolved issues
  if (!currentBadges.includes('community_hero') && (points >= 500 || resolvedCount >= 10)) {
    newBadges.push('community_hero');
  }

  // 2. Road Guardian: 5+ road damage issues reported
  if (!currentBadges.includes('road_guardian') && roadDamageCount >= 5) {
    newBadges.push('road_guardian');
  }

  // 3. Top Verifier: 10+ verified issues
  if (!currentBadges.includes('top_verifier') && verificationsCount >= 10) {
    newBadges.push('top_verifier');
  }

  if (newBadges.length > 0) {
    const updatedBadges = [...currentBadges, ...newBadges];
    await userRef.update({
      badges: updatedBadges,
    });

    // Send notifications for new badges
    for (const badgeId of newBadges) {
      const badgeData = BADGES.find(b => b.id === badgeId);
      if (badgeData) {
        await createNotification(userId, 'badge_earned', {
          title: `New Badge Unlocked: ${badgeData.name} ${badgeData.icon}`,
          message: `Congratulations! You unlocked the ${badgeData.name} badge.`,
          metadata: { badge: badgeId }
        });
      }
    }
  }

  return newBadges;
}

/**
 * Get gamification stats for a user
 */
export async function getUserGamificationStats(userId) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const userRef = adminDb.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }

  const userData = userSnap.data();
  const points = userData.points || 0;
  const levelInfo = calculateLevel(points);
  
  // Map badge IDs to full badge objects
  const userBadgeIds = userData.badges || [];
  const userBadges = userBadgeIds.map(id => BADGES.find(b => b.id === id)).filter(Boolean);

  return {
    points,
    level: levelInfo,
    badges: userBadges,
    trust_score: userData.trust_score || 50,
  };
}
