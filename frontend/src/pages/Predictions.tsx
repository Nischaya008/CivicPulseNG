import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell,
} from 'recharts';
import {
  Brain, TrendingUp, MapPin, AlertTriangle, Loader2,
  Shield, Zap, Activity, Eye, Target, Clock,
} from 'lucide-react';
import { useUserLocation } from '../lib/useUserLocation';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const RISK_COLORS: Record<string, string> = {
  Critical: '#dc2626',
  High: '#ea580c',
  Medium: '#d97706',
  Low: '#546B41',
};

export default function Predictions() {
  const { location, loading: locLoading } = useUserLocation();
  const [hotspots, setHotspots] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [riskZones, setRiskZones] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'hotspots' | 'trends' | 'risk'>('overview');

  useEffect(() => {
    if (locLoading) return;
    fetchPredictions();
  }, [location, locLoading]);

  useEffect(() => {
    if (dataLoaded && animationDone) {
      setLoading(false);
    }
  }, [dataLoaded, animationDone]);

  async function fetchPredictions() {
    setDataLoaded(false);
    setLoading(true);
    setAnimationDone(false);
    try {
      const locQuery = location ? `?lat=${location.lat}&lng=${location.lng}&radius_km=10` : '';

      const [hotspotsRes, trendsRes, riskRes, summaryRes] = await Promise.allSettled([
        fetch(`${BACKEND_URL}/api/predictions/hotspots${locQuery}`).then(r => r.json()),
        fetch(`${BACKEND_URL}/api/predictions/trends${locQuery}`).then(r => r.json()),
        fetch(`${BACKEND_URL}/api/predictions/risk-zones${locQuery}`).then(r => r.json()),
        fetch(`${BACKEND_URL}/api/predictions/summary${locQuery}`).then(r => r.json()),
      ]);

      if (hotspotsRes.status === 'fulfilled') setHotspots(hotspotsRes.value);
      if (trendsRes.status === 'fulfilled') setTrends(trendsRes.value);
      if (riskRes.status === 'fulfilled') setRiskZones(riskRes.value);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
    } catch (err) {
      console.error('Failed to load predictions:', err);
    } finally {
      setDataLoaded(true);
    }
  }

  if (loading) {
    return (
      <PredictionsLoader 
        dataLoaded={dataLoaded} 
        onComplete={() => setAnimationDone(true)} 
      />
    );
  }

  const summaryData = summary?.summary || {};
  const cityRiskScore = riskZones?.city_risk_score || 0;
  const trendDirection = trends?.trend_direction || 'stable';
  const hotspotCount = hotspots?.hotspots?.length || 0;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
      {/* ─── Header ─── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#546B41] to-[#3A4D2D] flex items-center justify-center shadow-md">
            <Brain size={20} className="text-[#FFF8EC]" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#546B41] tracking-tight">
            Predictive Intelligence
          </h1>
        </div>
        <p className="text-[#546B41]/70 text-sm flex items-center gap-1.5 font-medium">
          <MapPin size={16} className="text-[#99AD7A]" />
          {location ? `AI-powered forecasting for ${location.city || location.district || 'your area'}` : 'AI-powered forecasting of civic issue patterns and risk zones'}
        </p>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* City Risk Score */}
        <div className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[#546B41]/60 text-xs font-bold uppercase tracking-widest mb-1">Area Risk Score</div>
              <div className={`text-3xl font-black ${cityRiskScore >= 70 ? 'text-red-600' : cityRiskScore >= 40 ? 'text-amber-600' : 'text-[#546B41]'}`}>
                {cityRiskScore}
              </div>
              <div className="text-[#546B41]/50 text-xs font-semibold mt-1">out of 100</div>
            </div>
            <Shield size={24} className={cityRiskScore >= 70 ? 'text-red-500' : cityRiskScore >= 40 ? 'text-amber-500' : 'text-[#546B41]'} />
          </div>
        </div>

        {/* Trend Direction */}
        <div className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[#546B41]/60 text-xs font-bold uppercase tracking-widest mb-1">Issue Trend</div>
              <div className={`text-xl font-black capitalize mt-1 ${trendDirection === 'increasing' ? 'text-red-600' : trendDirection === 'decreasing' ? 'text-[#546B41]' : 'text-amber-600'}`}>
                {trendDirection}
              </div>
              <div className="text-[#546B41]/50 text-xs font-semibold mt-2">
                Strength: {Math.round((trends?.trend_strength || 0.5) * 100)}%
              </div>
            </div>
            <TrendingUp size={24} className={trendDirection === 'increasing' ? 'text-red-500' : 'text-[#546B41]'} />
          </div>
        </div>

        {/* Hotspot Count */}
        <div className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[#546B41]/60 text-xs font-bold uppercase tracking-widest mb-1">Predicted Hotspots</div>
              <div className="text-3xl font-black text-[#D4A853]">
                {hotspotCount}
              </div>
              <div className="text-[#546B41]/50 text-xs font-semibold mt-1">areas at risk</div>
            </div>
            <Target size={24} className="text-[#D4A853]" />
          </div>
        </div>

        {/* Highest Risk Category */}
        <div className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[#546B41]/60 text-xs font-bold uppercase tracking-widest mb-1">Highest Risk</div>
              <div className="text-base font-black text-red-500 leading-tight mt-1">
                {riskZones?.highest_risk_category || 'N/A'}
              </div>
              <div className="text-[#546B41]/50 text-xs font-semibold mt-2">category</div>
            </div>
            <AlertTriangle size={24} className="text-red-500" />
          </div>
        </div>
      </div>

      {/* ─── Tab Navigation ─── */}
      <div className="flex gap-2 mb-8 bg-[#FFF8EC] p-1.5 rounded-xl border border-[#DCCCAC] overflow-x-auto custom-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: <Eye size={16} /> },
          { id: 'hotspots', label: 'Hotspots', icon: <Target size={16} /> },
          { id: 'trends', label: 'Trends', icon: <Activity size={16} /> },
          { id: 'risk', label: 'Risk Zones', icon: <Shield size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-[#546B41] text-[#FFF8EC] shadow-sm' 
                : 'text-[#546B41]/70 hover:bg-[#546B41]/5'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          {/* AI Executive Summary */}
          {summaryData.executive_summary && (
            <div className="bg-gradient-to-br from-[#546B41] to-[#3A4D2D] rounded-2xl p-6 border border-[#99AD7A]/40 shadow-md">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Zap size={16} className="text-[#FFF8EC]" />
                </div>
                <span className="text-[#FFF8EC] font-bold">AI Executive Summary</span>
              </div>
              <p className="text-[#FFF8EC]/90 text-sm leading-relaxed font-medium">
                {summaryData.executive_summary}
              </p>
            </div>
          )}

          {/* Key Findings & Recommended Actions (Side by Side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Key Findings */}
            {summaryData.key_findings && summaryData.key_findings.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-[#DCCCAC] shadow-sm">
                <div className="text-[#546B41] font-bold mb-4 flex items-center gap-2">
                  <Activity size={18} /> Key Findings
                </div>
                <div className="flex flex-col gap-3">
                  {summaryData.key_findings.map((finding: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-[#FFF8EC] rounded-xl border border-[#DCCCAC]/50">
                      <span className="text-[#546B41] font-black text-xs bg-[#DCCCAC]/40 px-2 py-1 rounded-md shrink-0">#{i + 1}</span>
                      <span className="text-[#546B41]/80 text-sm font-medium">{finding}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Actions */}
            {summaryData.recommended_actions && summaryData.recommended_actions.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-[#DCCCAC] shadow-sm">
                <div className="text-[#546B41] font-bold mb-4 flex items-center gap-2">
                  <Shield size={18} /> Recommended Actions
                </div>
                <div className="flex flex-col gap-3">
                  {summaryData.recommended_actions.map((action: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-[#99AD7A]/10 border border-[#99AD7A]/30 rounded-xl">
                      <span className="text-[#546B41] shrink-0 mt-0.5">→</span>
                      <span className="text-[#546B41] text-sm font-bold">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Risk Outlook */}
          {summaryData.risk_outlook && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <div className="text-amber-800 font-bold mb-1">Risk Outlook (Next 2 Weeks)</div>
                <div className="text-amber-700/80 text-sm font-medium leading-relaxed">
                  {summaryData.risk_outlook}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'hotspots' && (
        <div className="flex flex-col gap-4">
          <div className="text-[#546B41]/70 text-sm font-medium mb-2">
            Predicted areas where new civic issues are likely to emerge in the next 14 days
          </div>

          {hotspots?.hotspots && hotspots.hotspots.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hotspots.hotspots.map((spot: any, i: number) => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1 h-full`} style={{ backgroundColor: RISK_COLORS[spot.risk_level] || '#DCCCAC' }} />
                  
                  <div className="flex justify-between items-start mb-3 pl-3">
                    <div className="flex items-center gap-2">
                      <MapPin size={18} color={RISK_COLORS[spot.risk_level] || '#546B41'} />
                      <span className="text-[#546B41] font-bold">
                        {spot.predicted_category || 'Civic Issue'}
                      </span>
                    </div>
                    <span 
                      className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider"
                      style={{ 
                        color: RISK_COLORS[spot.risk_level], 
                        backgroundColor: `${RISK_COLORS[spot.risk_level]}15`,
                        border: `1px solid ${RISK_COLORS[spot.risk_level]}30`
                      }}
                    >
                      {spot.risk_level} Risk
                    </span>
                  </div>

                  <div className="text-[#546B41]/70 text-xs font-medium mb-4 pl-3">
                    {spot.reasoning}
                  </div>

                  <div className="flex gap-3 flex-wrap pl-3">
                    <div className="bg-[#FFF8EC] border border-[#DCCCAC]/50 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#546B41]">
                      📍 {spot.lat?.toFixed(4)}, {spot.lng?.toFixed(4)}
                    </div>
                    <div className="bg-[#FFF8EC] border border-[#DCCCAC]/50 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#546B41]">
                      🎯 Conf: {Math.round((spot.confidence || 0) * 100)}%
                    </div>
                    <div className="bg-[#FFF8EC] border border-[#DCCCAC]/50 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#546B41]">
                      📊 Est. {spot.estimated_issues_next_14d || 0} issues
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-[#DCCCAC] shadow-sm">
              <div className="w-16 h-16 rounded-full bg-[#FFF8EC] flex items-center justify-center mx-auto mb-4 border border-[#DCCCAC]">
                <Target size={24} className="text-[#D4A853]" />
              </div>
              <p className="text-[#546B41] font-bold">No hotspot predictions yet</p>
              <p className="text-[#546B41]/60 text-sm mt-1">More data needed for accurate AI forecasting.</p>
            </div>
          )}

          {hotspots?.seasonal_factors && hotspots.seasonal_factors.length > 0 && (
            <div className="mt-4 bg-[#FFF8EC] border border-[#DCCCAC] rounded-2xl p-5">
              <div className="text-[#546B41] text-xs font-bold uppercase tracking-widest mb-3">
                🌤️ Seasonal Factors
              </div>
              <div className="flex flex-wrap gap-2">
                {hotspots.seasonal_factors.map((factor: string, i: number) => (
                  <span key={i} className="px-3 py-1.5 rounded-lg bg-white border border-[#DCCCAC] text-[#546B41] text-xs font-bold shadow-sm">
                    {factor}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="flex flex-col gap-6">
          {/* Trend Chart */}
          {trends?.forecast && trends.forecast.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-[#DCCCAC] shadow-sm">
              <div className="text-[#546B41] font-bold mb-6 flex items-center gap-2">
                <TrendingUp size={18} /> Issue Volume Forecast (14 Days)
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trends.forecast}>
                  <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#546B41" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#546B41" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DCCCAC50" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#546B41', fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                    stroke="#DCCCAC"
                  />
                  <YAxis tick={{ fill: '#546B41', fontSize: 10 }} stroke="#DCCCAC" />
                  <Tooltip
                    contentStyle={{
                      background: '#FFF8EC', border: '1px solid #DCCCAC',
                      borderRadius: '12px', color: '#546B41', fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="confidence_high"
                    stroke="none"
                    fill="#DCCCAC"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="predicted_volume"
                    stroke="#546B41"
                    fill="url(#forecastGrad)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="confidence_low"
                    stroke="none"
                    fill="#FFF8EC"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Weekly Pattern */}
            {trends?.weekly_pattern && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm text-center flex flex-col justify-center">
                  <div className="text-[#546B41]/60 text-xs font-bold uppercase tracking-widest mb-2">Peak Day</div>
                  <div className="text-red-500 text-2xl font-black">
                    {trends.weekly_pattern.peak_day}
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm text-center flex flex-col justify-center">
                  <div className="text-[#546B41]/60 text-xs font-bold uppercase tracking-widest mb-2">Quietest Day</div>
                  <div className="text-[#546B41] text-2xl font-black">
                    {trends.weekly_pattern.low_day}
                  </div>
                </div>
              </div>
            )}

            {/* Notable Insight */}
            {trends?.notable_insight && (
              <div className="bg-[#546B41]/5 border border-[#546B41]/20 rounded-2xl p-5 flex items-start gap-3 h-full">
                <div className="text-xl">💡</div>
                <div className="text-[#546B41] text-sm font-medium leading-relaxed">
                  {trends.notable_insight}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="flex flex-col gap-6">
          <div className="text-[#546B41]/70 text-sm font-medium">
            Risk assessment for geographic areas based on historical issue patterns
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Zone Bar Chart */}
            {riskZones?.risk_zones && riskZones.risk_zones.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-[#DCCCAC] shadow-sm">
                <div className="text-[#546B41] font-bold mb-6 flex items-center gap-2">
                  <Shield size={18} /> Risk Score Distribution
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={riskZones.risk_zones.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DCCCAC50" />
                    <XAxis
                      dataKey="dominant_category"
                      tick={{ fill: '#546B41', fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                      stroke="#DCCCAC"
                    />
                    <YAxis tick={{ fill: '#546B41', fontSize: 10 }} domain={[0, 100]} stroke="#DCCCAC" />
                    <Tooltip
                      contentStyle={{
                        background: '#FFF8EC', border: '1px solid #DCCCAC',
                        borderRadius: '12px', color: '#546B41', fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="risk_score" radius={[6, 6, 0, 0]}>
                      {riskZones.risk_zones.slice(0, 10).map((zone: any, i: number) => (
                        <Cell
                          key={i}
                          fill={RISK_COLORS[zone.risk_label] || '#546B41'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Improvement Areas */}
            {riskZones?.improvement_areas && riskZones.improvement_areas.length > 0 && (
              <div className="bg-[#FFF8EC] border border-[#DCCCAC] rounded-2xl p-6 h-full">
                <div className="text-[#546B41] text-sm font-bold uppercase tracking-widest mb-4">
                  📋 Areas for Improvement
                </div>
                <div className="flex flex-col gap-3">
                  {riskZones.improvement_areas.map((area: string, i: number) => (
                    <div key={i} className="text-[#546B41]/80 text-sm font-medium flex gap-2">
                      <span className="text-[#D4A853]">•</span> {area}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Risk Zone List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {riskZones?.risk_zones && riskZones.risk_zones.map((zone: any, i: number) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-[#DCCCAC] shadow-sm flex items-center gap-4">
                {/* Risk Score Badge */}
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-col shrink-0"
                  style={{ backgroundColor: `${RISK_COLORS[zone.risk_label] || '#546B41'}15` }}
                >
                  <div className="text-xl font-black" style={{ color: RISK_COLORS[zone.risk_label] || '#546B41' }}>
                    {zone.risk_score}
                  </div>
                </div>

                {/* Zone Info */}
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[#546B41] font-bold text-sm">
                      {zone.dominant_category}
                    </span>
                    <span 
                      className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
                      style={{ 
                        color: RISK_COLORS[zone.risk_label], 
                        backgroundColor: `${RISK_COLORS[zone.risk_label]}15` 
                      }}
                    >
                      {zone.risk_label}
                    </span>
                  </div>
                  <div className="text-[#546B41]/60 text-xs font-medium mb-3">
                    {zone.key_concern}
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#546B41]/70 text-[10px] font-bold bg-[#FFF8EC] px-2 py-1 rounded-md border border-[#DCCCAC]/50">
                      📊 {zone.issue_count} issues
                    </span>
                    <span className="text-[#546B41]/70 text-[10px] font-bold bg-[#FFF8EC] px-2 py-1 rounded-md border border-[#DCCCAC]/50">
                      ✅ {zone.resolution_rate_pct}% resolved
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PredictionsLoader({ dataLoaded, onComplete }: { dataLoaded: boolean, onComplete: () => void }) {
  const steps = [
    "Initializing AI Models...",
    "Scanning Geographic Data...",
    "Analyzing Historical Trends...",
    "Computing Risk Zones...",
    "Evaluating Civic Impact...",
    "Correlating Past Issues...",
    "Detecting Anomaly Patterns...",
    "Generating Insights...",
    "Processing Complex Data...",
    "Refining AI Models...",
    "Finalizing Predictions..."
  ];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (dataLoaded) {
      setCurrentStep(steps.length - 1);
      const t = setTimeout(() => onComplete(), 600);
      return () => clearTimeout(t);
    }

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        // Linger on the second to last step if data is not loaded
        if (prev >= steps.length - 2) return prev;
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [dataLoaded, steps.length, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center w-32 h-32">
        <div className="absolute inset-0 rounded-full border-2 border-[#DCCCAC] opacity-30 animate-[spin_4s_linear_infinite]" />
        <div className="absolute inset-2 rounded-full border-2 border-t-[#546B41] border-r-transparent border-b-[#99AD7A] border-l-transparent animate-[spin_2s_linear_infinite]" />
        
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#546B41] to-[#3A4D2D] flex items-center justify-center shadow-2xl relative overflow-hidden z-10 border border-[#99AD7A]/40">
          <div className="absolute inset-0 bg-[#FFF8EC]/10 animate-pulse" />
          <Brain size={32} className="text-[#FFF8EC]" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="h-8 overflow-hidden w-72 flex justify-center">
          <div className="flex flex-col transition-transform duration-500 ease-out text-center" style={{ transform: `translateY(-${currentStep * 32}px)` }}>
            {steps.map((step, i) => (
              <span key={i} className={`h-8 text-sm font-black uppercase tracking-wider flex items-center justify-center ${i === currentStep ? 'text-[#546B41]' : 'text-[#546B41]/30'}`}>
                {step}
              </span>
            ))}
          </div>
        </div>
        <div className="w-56 h-1.5 bg-[#DCCCAC]/30 rounded-full overflow-hidden shadow-inner relative">
          <div 
            className={`h-full bg-gradient-to-r from-[#546B41] to-[#99AD7A] transition-all duration-500 ease-out ${currentStep === steps.length - 1 && !dataLoaded ? 'animate-pulse' : ''}`}
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
