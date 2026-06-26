/**
 * CivicPulse Deterministic Severity & Priority Engine
 * 
 * Provides consistent, auditable severity and priority calculations
 * that don't depend on any external API. The LLM provides the raw
 * observations (category, danger scores); this engine normalizes
 * and validates them against calibrated municipal triage standards.
 * 
 * This ensures:
 * 1. Consistent ratings across identical issues (no LLM temperature variance)
 * 2. Auditable decision trail (every factor is logged)
 * 3. Works offline / when APIs are rate-limited
 * 4. Real-world calibrated thresholds based on municipal response protocols
 */

import { VALID_CATEGORIES, VALID_SEVERITIES } from './prompts.js';

// ═══════════════════════════════════════════════════════════════
// CATEGORY-SPECIFIC SEVERITY PROFILES
// ═══════════════════════════════════════════════════════════════
// Each category has inherent risk characteristics that affect
// how danger scores translate to severity levels.

const CATEGORY_PROFILES = {
  'Road Damage': {
    base_risk: 6,  // Roads affect traffic safety inherently
    critical_threshold: 7.5,  // Lower threshold — road damage kills
    high_threshold: 5.0,
    medium_threshold: 2.5,
    response_urgency_multiplier: 1.2,
    affects: ['vehicles', 'pedestrians', 'emergency_access'],
  },
  'Water Leakage': {
    base_risk: 5,
    critical_threshold: 7.5,
    high_threshold: 5.0,
    medium_threshold: 2.5,
    response_urgency_multiplier: 1.1,
    affects: ['water_supply', 'road_integrity', 'public_health'],
  },
  'Garbage Overflow': {
    base_risk: 4,
    critical_threshold: 8.0,  // Higher threshold — garbage rarely kills
    high_threshold: 5.5,
    medium_threshold: 3.0,
    response_urgency_multiplier: 0.9,
    affects: ['public_health', 'aesthetics', 'disease_vectors'],
  },
  'Streetlight Failure': {
    base_risk: 4,
    critical_threshold: 8.5,  // Very rarely critical unless mass failure
    high_threshold: 5.5,
    medium_threshold: 2.5,
    response_urgency_multiplier: 0.8,
    affects: ['pedestrian_safety', 'crime_prevention', 'traffic_safety'],
  },
  'Illegal Parking': {
    base_risk: 3,
    critical_threshold: 8.5,  // Critical only if blocking emergency access
    high_threshold: 6.0,
    medium_threshold: 3.0,
    response_urgency_multiplier: 0.7,
    affects: ['traffic_flow', 'pedestrian_access', 'emergency_access'],
  },
  'Public Safety': {
    base_risk: 8,  // Highest inherent risk category
    critical_threshold: 6.0,  // Lower threshold — safety issues are urgent
    high_threshold: 4.0,
    medium_threshold: 2.0,
    response_urgency_multiplier: 1.5,
    affects: ['human_life', 'physical_safety', 'public_welfare'],
  },
  'Drainage Issue': {
    base_risk: 5,
    critical_threshold: 7.5,
    high_threshold: 5.0,
    medium_threshold: 2.5,
    response_urgency_multiplier: 1.0,
    affects: ['flooding', 'public_health', 'infrastructure'],
  },
  'Noise Pollution': {
    base_risk: 2,
    critical_threshold: 9.0,  // Almost never critical
    high_threshold: 7.0,
    medium_threshold: 4.0,
    response_urgency_multiplier: 0.5,
    affects: ['quality_of_life', 'health', 'residential_peace'],
  },
  'Traffic Hazard': {
    base_risk: 7,
    critical_threshold: 6.5,
    high_threshold: 4.5,
    medium_threshold: 2.5,
    response_urgency_multiplier: 1.3,
    affects: ['vehicles', 'pedestrians', 'traffic_flow'],
  },
  'Vandalism': {
    base_risk: 3,
    critical_threshold: 8.5,
    high_threshold: 6.0,
    medium_threshold: 3.0,
    response_urgency_multiplier: 0.6,
    affects: ['public_property', 'aesthetics', 'community_morale'],
  },
  'Other': {
    base_risk: 4,
    critical_threshold: 7.5,
    high_threshold: 5.0,
    medium_threshold: 2.5,
    response_urgency_multiplier: 0.8,
    affects: ['varies'],
  },
};

// ═══════════════════════════════════════════════════════════════
// SEVERITY CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate validated severity from AI analysis output.
 * Uses category-specific thresholds for calibrated classification.
 * 
 * @param {object} aiResult - Raw AI analysis result
 * @returns {object} Validated and calibrated severity assessment
 */
export function calculateSeverity(aiResult) {
  const category = normalizeCategory(aiResult.category);
  const profile = CATEGORY_PROFILES[category] || CATEGORY_PROFILES['Other'];
  
  // Validate and clamp danger score
  let dangerScore = parseFloat(aiResult.danger_score);
  if (isNaN(dangerScore) || dangerScore < 0) dangerScore = 3.0;
  if (dangerScore > 10) dangerScore = 10.0;
  
  // Validate danger breakdown if provided
  const breakdown = validateDangerBreakdown(aiResult.danger_breakdown);
  
  // If breakdown exists, recalculate danger_score from it for consistency
  if (breakdown) {
    const recalculated = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
    // Use the breakdown-based score if it's reasonably close, otherwise trust the model
    if (Math.abs(recalculated - dangerScore) > 2.0) {
      dangerScore = recalculated;
    }
  }
  
  // Determine severity using category-specific thresholds
  let severity;
  if (dangerScore >= profile.critical_threshold) {
    severity = 'Critical';
  } else if (dangerScore >= profile.high_threshold) {
    severity = 'High';
  } else if (dangerScore >= profile.medium_threshold) {
    severity = 'Medium';
  } else {
    severity = 'Low';
  }
  
  // Calculate response time based on severity and category urgency
  const responseTime = getRecommendedResponseTime(severity, profile.response_urgency_multiplier);
  
  // Calculate confidence adjustment
  let confidence = parseFloat(aiResult.confidence);
  if (isNaN(confidence) || confidence < 0) confidence = 0.5;
  if (confidence > 1) confidence = 1.0;
  
  return {
    category,
    severity,
    danger_score: Math.round(dangerScore * 10) / 10,
    danger_breakdown: breakdown,
    confidence: Math.round(confidence * 100) / 100,
    recommended_response_time: responseTime,
    category_profile: {
      base_risk: profile.base_risk,
      affects: profile.affects,
    },
    calculation_method: 'deterministic_v2',
  };
}

/**
 * Calculate a priority score (0-100) from issue data.
 * Pure deterministic — no API calls.
 * 
 * @param {object} params
 * @returns {object} Priority assessment
 */
export function calculatePriority({
  severity,
  dangerScore,
  category,
  verificationConfirms = 0,
  verificationRejects = 0,
  totalVotes = 0,
  urgency = 5,
  hoursSinceReport = 0,
  nearbyIssueCount = 0,
}) {
  const profile = CATEGORY_PROFILES[category] || CATEGORY_PROFILES['Other'];
  
  // Factor 1: Severity (40% weight, max 40 pts)
  const severityWeights = { Critical: 40, High: 28, Medium: 16, Low: 4 };
  const severityPts = severityWeights[severity] || 16;
  
  // Factor 2: Danger to public (20% weight, max 20 pts)
  const ds = parseFloat(dangerScore) || 5;
  const dangerPts = Math.round((ds / 10) * 20);
  
  // Factor 3: Verification strength (15% weight, max 15 pts)
  const netConfirms = Math.max(0, (verificationConfirms || 0) - (verificationRejects || 0));
  const verificationPts = Math.min(15, netConfirms * 5);
  
  // Factor 4: Urgency (10% weight, max 10 pts)
  const urg = parseFloat(urgency) || 5;
  const urgencyPts = Math.round((urg / 10) * 10);
  
  // Factor 5: Category impact (10% weight, max 10 pts)
  const categoryPts = Math.round((profile.base_risk / 10) * 10);
  
  // Factor 6: Recency (5% weight, max 5 pts)
  const hrs = parseFloat(hoursSinceReport) || 0;
  const recencyPts = hrs <= 6 ? 5 : hrs <= 24 ? 3 : hrs <= 72 ? 1 : 0;
  
  // Hotspot amplifier: areas with many issues get a boost (max +5 bonus)
  const hotspotBonus = Math.min(5, Math.floor((nearbyIssueCount || 0) / 3));
  
  const rawScore = severityPts + dangerPts + verificationPts + urgencyPts + categoryPts + recencyPts + hotspotBonus;
  const priorityScore = Math.max(0, Math.min(100, rawScore));
  
  const priorityLabel = getPriorityLabel(priorityScore);
  
  return {
    priority_score: priorityScore,
    priority_label: priorityLabel,
    reasoning: `Severity ${severity} (${severityPts}pts) + Danger ${ds}/10 (${dangerPts}pts) + ${netConfirms} confirmations (${verificationPts}pts) + Urgency (${urgencyPts}pts) + ${category} impact (${categoryPts}pts) + Recency (${recencyPts}pts) + Hotspot (${hotspotBonus}pts)`,
    factor_breakdown: {
      severity_pts: severityPts,
      danger_pts: dangerPts,
      verification_pts: verificationPts,
      urgency_pts: urgencyPts,
      category_pts: categoryPts,
      recency_pts: recencyPts,
      hotspot_bonus: hotspotBonus,
    },
    recommended_response_time: getRecommendedResponseTime(priorityLabel, profile.response_urgency_multiplier),
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize category string to match valid categories
 */
function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'string') return 'Other';
  
  const cleaned = raw.trim();
  
  // Exact match
  if (VALID_CATEGORIES.includes(cleaned)) return cleaned;
  
  // Case-insensitive match
  const lower = cleaned.toLowerCase();
  const match = VALID_CATEGORIES.find(c => c.toLowerCase() === lower);
  if (match) return match;
  
  // Fuzzy match common variations
  const fuzzyMap = {
    'pothole': 'Road Damage',
    'road': 'Road Damage',
    'street': 'Road Damage',
    'water': 'Water Leakage',
    'pipe': 'Water Leakage',
    'leak': 'Water Leakage',
    'garbage': 'Garbage Overflow',
    'trash': 'Garbage Overflow',
    'waste': 'Garbage Overflow',
    'litter': 'Garbage Overflow',
    'light': 'Streetlight Failure',
    'lamp': 'Streetlight Failure',
    'parking': 'Illegal Parking',
    'safety': 'Public Safety',
    'hazard': 'Public Safety',
    'manhole': 'Public Safety',
    'drain': 'Drainage Issue',
    'sewer': 'Drainage Issue',
    'flood': 'Drainage Issue',
    'noise': 'Noise Pollution',
    'traffic': 'Traffic Hazard',
    'signal': 'Traffic Hazard',
    'sign': 'Traffic Hazard',
    'graffiti': 'Vandalism',
    'vandal': 'Vandalism',
  };
  
  for (const [keyword, category] of Object.entries(fuzzyMap)) {
    if (lower.includes(keyword)) return category;
  }
  
  return 'Other';
}

/**
 * Validate and clamp danger breakdown values
 */
function validateDangerBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return null;
  
  const fields = [
    'pedestrian_traffic_risk',
    'scale_size',
    'structural_integrity_risk',
    'environmental_health_hazard',
    'mobility_access_impact',
  ];
  
  const validated = {};
  let hasAnyField = false;
  
  for (const field of fields) {
    let val = parseFloat(breakdown[field]);
    if (isNaN(val)) val = 0;
    validated[field] = Math.max(0, Math.min(2.0, Math.round(val * 10) / 10));
    if (validated[field] > 0) hasAnyField = true;
  }
  
  return hasAnyField ? validated : null;
}

function getPriorityLabel(score) {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

function getRecommendedResponseTime(severity, multiplier = 1.0) {
  const baseHours = {
    'Critical': 4,
    'High': 24,
    'Medium': 72,
    'Low': 168,  // 7 days
  };
  
  const hours = Math.round((baseHours[severity] || 168) / multiplier);
  
  if (hours <= 4) return 'Emergency — within 4 hours';
  if (hours <= 12) return 'Urgent — within 12 hours';
  if (hours <= 24) return 'Within 24 hours';
  if (hours <= 72) return 'Within 3 days';
  if (hours <= 168) return 'Within 7 days';
  return 'Within 14 days';
}
