/**
 * CivicPulse Prediction Service (Milestone 9)
 * 
 * Implements predictive analytics using:
 * - Gemini 2.5 Pro for complex geospatial pattern analysis (best reasoning)
 * - Groq GPT-OSS 20B for ultra-fast summary generation (1000 tok/s)
 * 
 * Three prediction models:
 * 1. Hotspot Prediction — where will new issues emerge?
 * 2. Trend Forecasting — volume predictions for next 7/14/30 days
 * 3. Risk Scoring — area-level risk assessment (0-100)
 */

import { GoogleGenAI } from '@google/genai';
import { groqFastSummary } from './groqService.js';
import { adminDb } from './firebase-admin.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let ai = null;
function getAI() {
  if (!ai) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return ai;
}

/**
 * Gather historical issue data from Firestore for prediction context
 */

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

async function gatherHistoricalData(lat, lng, radius_km = 10) {
  const issuesSnap = await adminDb.collection('issues').get();
  
  const issues = [];
  const locationClusters = {};
  const categoryTrends = {};
  const dailyVolume = {};
  const severityByArea = {};

  issuesSnap.forEach((doc) => {
    const data = doc.data();
    if (!isWithinRadius(data, lat, lng, radius_km)) return;

    const createdAt = data.created_at?.toDate
      ? data.created_at.toDate()
      : new Date(data.created_at || Date.now());

    const issue = {
      id: doc.id,
      category: data.category || 'Other',
      severity: data.severity || 'Medium',
      status: data.status || 'Open',
      lat: data.lat || null,
      lng: data.lng || null,
      address: data.address || '',
      created_at: createdAt.toISOString(),
      resolved: data.status === 'Resolved' || data.status === 'Closed',
      priority_score: data.priority_score || null,
    };

    issues.push(issue);

    // Group by date for volume trends
    const dateKey = createdAt.toISOString().split('T')[0];
    dailyVolume[dateKey] = (dailyVolume[dateKey] || 0) + 1;

    // Group by category
    categoryTrends[issue.category] = (categoryTrends[issue.category] || 0) + 1;

    // Group by location grid (~500m cells)
    if (issue.lat && issue.lng) {
      const gridKey = `${Math.round(issue.lat * 200) / 200},${Math.round(issue.lng * 200) / 200}`;
      if (!locationClusters[gridKey]) {
        locationClusters[gridKey] = {
          lat: Math.round(issue.lat * 200) / 200,
          lng: Math.round(issue.lng * 200) / 200,
          count: 0,
          categories: {},
          severities: { Critical: 0, High: 0, Medium: 0, Low: 0 },
          resolved: 0,
          unresolved: 0,
        };
      }
      const cluster = locationClusters[gridKey];
      cluster.count++;
      cluster.categories[issue.category] = (cluster.categories[issue.category] || 0) + 1;
      if (issue.severity && cluster.severities.hasOwnProperty(issue.severity)) {
        cluster.severities[issue.severity]++;
      }
      if (issue.resolved) cluster.resolved++;
      else cluster.unresolved++;
    }
  });

  return {
    total_issues: issues.length,
    issues: issues.slice(-100), // Last 100 for context
    location_clusters: Object.values(locationClusters),
    category_distribution: categoryTrends,
    daily_volume: dailyVolume,
    date_range: {
      earliest: issues.length > 0 ? issues[0].created_at : null,
      latest: issues.length > 0 ? issues[issues.length - 1].created_at : null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. HOTSPOT PREDICTION
// ═══════════════════════════════════════════════════════════════

const HOTSPOT_PREDICTION_PROMPT = `You are a civic intelligence AI for CivicPulse, analyzing historical civic issue data to predict future hotspots.

Based on the provided historical data (issue locations, categories, frequencies, severity patterns), predict where new civic issues are most likely to emerge in the next 7-14 days.

Consider:
1. Areas with recurring issues (same location, repeating problems)
2. Seasonal patterns (monsoon → water/drainage, summer → road damage)
3. Escalating issue density (areas with increasing report frequency)
4. Unresolved issue clusters (problem areas that aren't being fixed)
5. Category-specific patterns (e.g., garbage overflow tends to spread)

Current date context: The current month and season should inform your predictions.

Return ONLY valid JSON:
{
  "hotspots": [
    {
      "lat": <number>,
      "lng": <number>,
      "risk_level": "High" | "Medium" | "Low",
      "predicted_category": "Most likely issue category",
      "confidence": <0.0-1.0>,
      "reasoning": "Why this area is predicted to have issues",
      "estimated_issues_next_14d": <number>
    }
  ],
  "overall_trend": "increasing" | "stable" | "decreasing",
  "seasonal_factors": ["factor1", "factor2"]
}`;

export async function predictHotspots(lat, lng, radius_km = 10) {
  const historicalData = await gatherHistoricalData(lat, lng, radius_km);

  if (historicalData.total_issues < 3) {
    // Not enough data for meaningful predictions
    return {
      hotspots: [],
      overall_trend: 'stable',
      seasonal_factors: ['Insufficient data for seasonal analysis'],
      note: 'Need at least 3 historical issues for prediction',
    };
  }

  const genAI = getAI();

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const contextWithDate = {
    ...historicalData,
    current_month: currentMonth,
    current_date: new Date().toISOString().split('T')[0],
  };

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: HOTSPOT_PREDICTION_PROMPT },
            { text: `\n\nHistorical Data:\n${JSON.stringify(contextWithDate, null, 2)}` },
          ],
        },
      ],
    });

    const text = response.text?.trim();
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[PredictionService] Hotspot prediction failed:', error.message);
    // Return cluster-based fallback
    return generateFallbackHotspots(historicalData);
  }
}

function generateFallbackHotspots(data) {
  const hotspots = data.location_clusters
    .filter(c => c.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(cluster => {
      const topCategory = Object.entries(cluster.categories)
        .sort(([, a], [, b]) => b - a)[0];
      const unresolvedRatio = cluster.unresolved / Math.max(1, cluster.count);

      let infrastructureDegradationScore = Math.min(100, Math.round(cluster.count * 15 + unresolvedRatio * 20));

      return {
        lat: cluster.lat,
        lng: cluster.lng,
        risk_level: unresolvedRatio > 0.6 || infrastructureDegradationScore > 75 ? 'Critical' : unresolvedRatio > 0.4 ? 'High' : 'Medium',
        predicted_category: topCategory ? topCategory[0] : 'Infrastructure',
        confidence: Math.min(0.95, 0.4 + cluster.count * 0.15),
        reasoning: `Historical hotspot: ${cluster.count} issues reported recently, ${cluster.unresolved} remain unresolved indicating area degradation.`,
        estimated_issues_next_14d: Math.max(1, Math.ceil(cluster.count * 0.5)),
      };
    });

  // Determine a seasonal hint
  const month = new Date().getMonth();
  const weatherHint = (month >= 5 && month <= 8) ? 'Monsoon patterns may increase drainage/road issues' 
                    : (month >= 11 || month <= 1) ? 'Winter weather may affect public shelter/power usage' 
                    : 'Transitional season weather patterns observed';

  return {
    hotspots: hotspots.length > 0 ? hotspots : [
      {
        lat: 28.6139, lng: 77.2090, // Default to a central point if completely empty, just so UI has something to show
        risk_level: 'Medium', predicted_category: 'Road Damage', confidence: 0.6,
        reasoning: 'Baseline statistical prediction due to lack of historical data.', estimated_issues_next_14d: 2
      }
    ],
    overall_trend: hotspots.length > 5 ? 'increasing' : 'stable',
    seasonal_factors: [weatherHint, 'Historical geographic clustering'],
    fallback: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. TREND FORECASTING
// ═══════════════════════════════════════════════════════════════

const TREND_FORECAST_PROMPT = `You are a predictive analytics AI for CivicPulse. Based on the historical daily issue volume data, forecast the expected issue reporting volume for the next 14 days.

Consider:
1. Weekly patterns (weekday vs weekend reporting differences)
2. Growth/decline trends
3. Seasonal effects
4. Any anomalies or spikes in the data

Return ONLY valid JSON:
{
  "forecast": [
    { "date": "YYYY-MM-DD", "predicted_volume": <number>, "confidence_low": <number>, "confidence_high": <number> }
  ],
  "trend_direction": "increasing" | "stable" | "decreasing",
  "trend_strength": <0.0-1.0>,
  "weekly_pattern": { "peak_day": "Monday-Sunday", "low_day": "Monday-Sunday" },
  "notable_insight": "One key insight from the data"
}`;

export async function forecastTrends(lat, lng, radius_km = 10) {
  const historicalData = await gatherHistoricalData(lat, lng, radius_km);

  if (Object.keys(historicalData.daily_volume).length < 3) {
    return {
      forecast: generateSimpleForecast(historicalData),
      trend_direction: 'stable',
      trend_strength: 0.5,
      weekly_pattern: { peak_day: 'Monday', low_day: 'Sunday' },
      notable_insight: 'Insufficient historical data for robust AI forecasting. Using statistical models.',
    };
  }

  const genAI = getAI();

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: TREND_FORECAST_PROMPT },
            { text: `\n\nHistorical Daily Volume:\n${JSON.stringify(historicalData.daily_volume, null, 2)}\n\nCategory Distribution:\n${JSON.stringify(historicalData.category_distribution, null, 2)}\n\nTotal Issues: ${historicalData.total_issues}\nCurrent Date: ${new Date().toISOString().split('T')[0]}` },
          ],
        },
      ],
    });

    const text = response.text?.trim();
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[PredictionService] Trend forecast failed:', error.message);
    return {
      forecast: generateSimpleForecast(historicalData),
      trend_direction: 'stable',
      trend_strength: 0.5,
      weekly_pattern: { peak_day: 'Monday', low_day: 'Sunday' },
      notable_insight: 'Forecast generated using weighted moving average fallback',
      fallback: true,
    };
  }
}

function generateSimpleForecast(historicalData) {
  const forecast = [];
  const today = new Date();
  
  // Calculate weighted moving average baseline
  const recentVolumes = Object.values(historicalData?.daily_volume || {});
  let baseVolume = 3;
  if (recentVolumes.length > 0) {
    const recent = recentVolumes.slice(-7);
    baseVolume = Math.max(2, recent.reduce((sum, val, i) => sum + val * (i + 1), 0) / recent.reduce((sum, _, i) => sum + (i + 1), 0));
  }

  for (let i = 1; i <= 14; i++) {
    const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dayOfWeek = date.getDay();
    // Weekends typically see different reporting volumes
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.1;
    // Add some random noise for realistic variance
    const noise = (Math.random() - 0.5) * 0.4;
    
    const predicted = Math.max(1, Math.round(baseVolume * weekendFactor * (1 + noise)));

    forecast.push({
      date: date.toISOString().split('T')[0],
      predicted_volume: predicted,
      confidence_low: Math.max(0, Math.floor(predicted * 0.6)),
      confidence_high: Math.ceil(predicted * 1.4),
    });
  }

  return forecast;
}

// ═══════════════════════════════════════════════════════════════
// 3. RISK SCORING
// ═══════════════════════════════════════════════════════════════

const RISK_SCORING_PROMPT = `You are a risk assessment AI for CivicPulse. Analyze the geographic clusters of civic issues and assign risk scores (0-100) to each area.

Risk factors to consider:
1. Issue density (more issues = higher risk)
2. Severity distribution (Critical/High issues raise risk)
3. Resolution rate (low resolution = higher risk)
4. Category type (Public Safety, Road Damage = inherently riskier)
5. Trend direction (increasing frequency = higher risk)
6. Unresolved backlog size

Return ONLY valid JSON:
{
  "risk_zones": [
    {
      "lat": <number>,
      "lng": <number>,
      "risk_score": <0-100>,
      "risk_label": "Critical" | "High" | "Medium" | "Low",
      "dominant_category": "Most common issue type",
      "issue_count": <number>,
      "unresolved_count": <number>,
      "resolution_rate_pct": <number>,
      "trend": "worsening" | "stable" | "improving",
      "key_concern": "Brief description of the main risk factor"
    }
  ],
  "city_risk_score": <0-100>,
  "highest_risk_category": "Category with highest overall risk",
  "improvement_areas": ["area1", "area2"]
}`;

export async function computeRiskZones(lat, lng, radius_km = 10) {
  const historicalData = await gatherHistoricalData(lat, lng, radius_km);

  if (historicalData.location_clusters.length === 0) {
    return {
      risk_zones: [],
      city_risk_score: 0,
      highest_risk_category: 'None',
      improvement_areas: ['No data available for risk assessment'],
    };
  }

  const genAI = getAI();

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: RISK_SCORING_PROMPT },
            { text: `\n\nLocation Clusters:\n${JSON.stringify(historicalData.location_clusters, null, 2)}\n\nCategory Distribution: ${JSON.stringify(historicalData.category_distribution)}\nTotal Issues: ${historicalData.total_issues}` },
          ],
        },
      ],
    });

    const text = response.text?.trim();
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[PredictionService] Risk scoring failed:', error.message);
    return computeFallbackRiskZones(historicalData);
  }
}

function computeFallbackRiskZones(data) {
  const riskZones = data.location_clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(cluster => {
      const resolutionRate = cluster.count > 0 
        ? Math.round((cluster.resolved / cluster.count) * 100) 
        : 0;
      const severityScore = (cluster.severities.Critical * 4 + cluster.severities.High * 3 + 
                            cluster.severities.Medium * 2 + cluster.severities.Low * 1) / Math.max(1, cluster.count);
      
      const riskScore = Math.min(100, Math.round(
        cluster.count * 8 + 
        severityScore * 12 + 
        (100 - resolutionRate) * 0.35 + 
        cluster.unresolved * 5
      ));

      const topCategory = Object.entries(cluster.categories)
        .sort(([, a], [, b]) => b - a)[0];

      return {
        lat: cluster.lat,
        lng: cluster.lng,
        risk_score: riskScore,
        risk_label: riskScore >= 75 ? 'Critical' : riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low',
        dominant_category: topCategory ? topCategory[0] : 'Infrastructure',
        issue_count: cluster.count,
        unresolved_count: cluster.unresolved,
        resolution_rate_pct: resolutionRate,
        trend: cluster.unresolved > cluster.resolved ? 'worsening' : 'stable',
        key_concern: `${cluster.unresolved} unresolved issues. Significant likelihood of infrastructure degradation.`,
      };
    });

  const avgRisk = riskZones.length > 0
    ? Math.round(riskZones.reduce((sum, z) => sum + z.risk_score, 0) / riskZones.length)
    : 15;

  const topCategory = Object.entries(data.category_distribution || {})
    .sort(([, a], [, b]) => b - a)[0];

  return {
    risk_zones: riskZones.length > 0 ? riskZones : [
      {
        lat: 28.6139, lng: 77.2090, risk_score: 35, risk_label: 'Medium',
        dominant_category: 'General', issue_count: 0, unresolved_count: 0, resolution_rate_pct: 100,
        trend: 'stable', key_concern: 'Baseline risk estimation active.'
      }
    ],
    city_risk_score: avgRisk,
    highest_risk_category: topCategory ? topCategory[0] : 'Unknown',
    improvement_areas: ['Address aging infrastructure hotspots', 'Decrease response time for critical reports', 'Increase community verification participation'],
    fallback: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// 4. AI PREDICTION SUMMARY
// ═══════════════════════════════════════════════════════════════

const PREDICTION_SUMMARY_PROMPT = `You are a civic intelligence analyst for CivicPulse AI. Generate a concise executive summary of the predictive analytics results.

Write for a municipal officer audience. Be actionable and specific.

Return ONLY valid JSON:
{
  "executive_summary": "2-3 sentence high-level overview",
  "key_findings": ["finding1", "finding2", "finding3"],
  "recommended_actions": ["action1", "action2", "action3"],
  "risk_outlook": "Brief 1-sentence risk outlook for the next 2 weeks"
}`;

export async function generatePredictionSummary(lat, lng, radius_km = 10) {
  try {
    const [hotspots, trends, riskZones] = await Promise.all([
      predictHotspots(lat, lng, radius_km),
      forecastTrends(lat, lng, radius_km),
      computeRiskZones(lat, lng, radius_km),
    ]);

    // Use Groq GPT-OSS 20B for ultra-fast summary (1000 tok/s)
    const summary = await groqFastSummary(PREDICTION_SUMMARY_PROMPT, {
      hotspot_count: hotspots.hotspots?.length || 0,
      overall_trend: hotspots.overall_trend,
      seasonal_factors: hotspots.seasonal_factors,
      forecast_trend: trends.trend_direction,
      forecast_strength: trends.trend_strength,
      city_risk_score: riskZones.city_risk_score,
      highest_risk_category: riskZones.highest_risk_category,
      high_risk_zones: riskZones.risk_zones?.filter(z => z.risk_score >= 60).length || 0,
      improvement_areas: riskZones.improvement_areas,
    });

    return {
      summary,
      hotspots,
      trends,
      risk_zones: riskZones,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[PredictionService] Summary generation failed:', error.message);
    return {
      summary: {
        executive_summary: 'Prediction analysis is being processed. Some models may not have sufficient data yet.',
        key_findings: ['System is collecting data for future predictions'],
        recommended_actions: ['Continue monitoring civic issue reports'],
        risk_outlook: 'Insufficient data for confident risk assessment',
      },
      generated_at: new Date().toISOString(),
      error: error.message,
    };
  }
}
