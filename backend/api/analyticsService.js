/**
 * CivicPulse Analytics Service (Milestone 6)
 * 
 * Aggregates data from Firestore for dashboard widgets,
 * charts, and heatmap visualizations.
 */

import { adminDb } from './firebase-admin.js';

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isWithinRadius(issue, lat, lng, radiusKm = 10) {
  if (!lat || !lng) return true;
  if (!issue.lat || !issue.lng) return false;
  return getDistance(parseFloat(lat), parseFloat(lng), issue.lat, issue.lng) <= parseFloat(radiusKm);
}

/**
 * Get overview KPI statistics
 */
export async function getOverview(lat, lng, radius_km = 10) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const issuesSnap = await adminDb.collection('issues').get();
  
  let total = 0;
  let resolved = 0;
  let inProgress = 0;
  let verified = 0;
  let totalResolutionTimeMs = 0;
  let resolvedWithTime = 0;
  const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const statusCounts = {};
  const categoryCounts = {};

  issuesSnap.forEach((doc) => {
    const issue = doc.data();
    if (!isWithinRadius(issue, lat, lng, radius_km)) return;

    total++;

    statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;

    if (issue.status === 'Resolved' || issue.status === 'Closed') {
      resolved++;
      if (issue.created_at && issue.resolved_at) {
        const created = issue.created_at.toDate ? issue.created_at.toDate() : new Date(issue.created_at);
        const resolvedAt = issue.resolved_at.toDate ? issue.resolved_at.toDate() : new Date(issue.resolved_at);
        totalResolutionTimeMs += resolvedAt - created;
        resolvedWithTime++;
      }
    }

    if (issue.status === 'In Progress') inProgress++;
    if (issue.status === 'Community Verified') verified++;

    if (issue.severity && severityCounts.hasOwnProperty(issue.severity)) {
      severityCounts[issue.severity]++;
    }

    if (issue.category) {
      categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1;
    }
  });

  const avgResolutionHours = resolvedWithTime > 0
    ? Math.round((totalResolutionTimeMs / resolvedWithTime) / (1000 * 60 * 60) * 10) / 10
    : null;

  const usersSnap = await adminDb.collection('users').get();
  const activeUsers = usersSnap.size;

  return {
    total_issues: total,
    resolved_issues: resolved,
    in_progress: inProgress,
    verified: verified,
    open_issues: total - resolved,
    resolution_rate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    avg_resolution_hours: avgResolutionHours,
    active_users: activeUsers,
    severity_breakdown: severityCounts,
    status_breakdown: statusCounts,
    category_breakdown: categoryCounts,
  };
}

/**
 * Get time-series trend data for charts
 */
export async function getTrends(period = '30d', lat, lng, radius_km = 10) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const now = new Date();
  let startDate;
  let groupBy;

  switch (period) {
    case '7d': startDate = new Date(now.getTime() - 7*24*60*60*1000); groupBy = 'day'; break;
    case '30d': startDate = new Date(now.getTime() - 30*24*60*60*1000); groupBy = 'day'; break;
    case '90d': startDate = new Date(now.getTime() - 90*24*60*60*1000); groupBy = 'week'; break;
    default: startDate = new Date(now.getTime() - 30*24*60*60*1000); groupBy = 'day';
  }

  const issuesSnap = await adminDb.collection('issues').get();
  const dailyData = {};

  issuesSnap.forEach((doc) => {
    const issue = doc.data();
    if (!issue.created_at) return;
    if (!isWithinRadius(issue, lat, lng, radius_km)) return;

    const createdAt = issue.created_at.toDate ? issue.created_at.toDate() : new Date(issue.created_at);
    if (createdAt < startDate) return;

    let key;
    if (groupBy === 'day') {
      key = createdAt.toISOString().split('T')[0];
    } else {
      const weekStart = new Date(createdAt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      key = weekStart.toISOString().split('T')[0];
    }

    if (!dailyData[key]) dailyData[key] = { date: key, reported: 0, resolved: 0, verified: 0 };
    dailyData[key].reported++;

    if (issue.status === 'Resolved' || issue.status === 'Closed') dailyData[key].resolved++;
    if (issue.status === 'Community Verified') dailyData[key].verified++;
  });

  const result = [];
  const cursor = new Date(startDate);
  while (cursor <= now) {
    const key = cursor.toISOString().split('T')[0];
    result.push(dailyData[key] || { date: key, reported: 0, resolved: 0, verified: 0 });
    if (groupBy === 'day') cursor.setDate(cursor.getDate() + 1);
    else cursor.setDate(cursor.getDate() + 7);
  }

  return result;
}

/**
 * Get category distribution for pie/donut charts
 */
export async function getCategoryDistribution(lat, lng, radius_km = 10) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const issuesSnap = await adminDb.collection('issues').get();
  const counts = {};

  issuesSnap.forEach((doc) => {
    const issue = doc.data();
    if (!isWithinRadius(issue, lat, lng, radius_km)) return;

    const category = issue.category || 'Other';
    counts[category] = (counts[category] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Get hotspot data for heatmap overlay
 */
export async function getHotspots(lat, lng, radius_km = 10) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const issuesSnap = await adminDb.collection('issues').get();
  const points = [];

  issuesSnap.forEach((doc) => {
    const issue = doc.data();
    if (!isWithinRadius(issue, lat, lng, radius_km)) return;

    if (issue.lat && issue.lng) {
      points.push({
        lat: issue.lat,
        lng: issue.lng,
        weight: issue.severity === 'Critical' ? 4 :
                issue.severity === 'High' ? 3 :
                issue.severity === 'Medium' ? 2 : 1,
        category: issue.category,
        title: issue.title,
      });
    }
  });

  return points;
}

/**
 * Get leaderboard — top contributors by points
 * (No distance filter here as users don't have lat/lng in users collection currently, 
 * but we can filter by points)
 */
export async function getLeaderboard(limitCount = 20) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const usersSnap = await adminDb
    .collection('users')
    .orderBy('points', 'desc')
    .limit(limitCount)
    .get();

  const leaderboard = [];
  let rank = 1;

  usersSnap.forEach((doc) => {
    const user = doc.data();
    leaderboard.push({
      rank: rank++,
      user_id: doc.id,
      name: user.name || 'Anonymous',
      avatar: user.avatar || null,
      points: user.points || 0,
      trust_score: user.trust_score || 50,
      role: user.role || 'citizen',
    });
  });

  return leaderboard;
}

/**
 * Get severity breakdown over time
 */
export async function getSeverityTrend(period = '30d', lat, lng, radius_km = 10) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const now = new Date();
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const issuesSnap = await adminDb.collection('issues').get();
  const severityByDate = {};

  issuesSnap.forEach((doc) => {
    const issue = doc.data();
    if (!issue.created_at) return;
    if (!isWithinRadius(issue, lat, lng, radius_km)) return;

    const createdAt = issue.created_at.toDate ? issue.created_at.toDate() : new Date(issue.created_at);
    if (createdAt < startDate) return;

    const key = createdAt.toISOString().split('T')[0];
    if (!severityByDate[key]) {
      severityByDate[key] = { date: key, Critical: 0, High: 0, Medium: 0, Low: 0 };
    }

    if (issue.severity && severityByDate[key].hasOwnProperty(issue.severity)) {
      severityByDate[key][issue.severity]++;
    }
  });

  return Object.values(severityByDate).sort((a, b) => a.date.localeCompare(b.date));
}

