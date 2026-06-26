import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, LineChart, Line,
} from 'recharts';
import {
  TrendingUp, AlertTriangle, CheckCircle, Clock, Users, MapPin,
  BarChart3, PieChart as PieChartIcon, Activity, Award, Loader2,
  Brain, ChevronRight, Shield, Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUserLocation } from '../lib/useUserLocation';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const CATEGORY_COLORS = [
  '#546B41', '#99AD7A', '#D4A853', '#C17B3A', '#8B6F4E',
  '#6B8E5A', '#B8860B', '#7A9E6D', '#A0522D', '#6B8E23', '#8FBC8F',
];

interface KPIData {
  total_issues: number;
  resolved_issues: number;
  resolution_rate: number;
  avg_resolution_hours: number | null;
  active_users: number;
  severity_breakdown: Record<string, number>;
  status_breakdown: Record<string, number>;
  category_breakdown: Record<string, number>;
  open_issues: number;
  verified: number;
  in_progress: number;
}

export default function Analytics() {
  const { location, loading: locLoading } = useUserLocation();
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [severityTrends, setSeverityTrends] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    if (locLoading) return;
    async function fetchAnalytics() {
      setDataLoaded(false);
      setLoading(true);
      setAnimationDone(false);
      try {
        const locParams = location ? `&lat=${location.lat}&lng=${location.lng}&radius_km=10` : '';
        const locQuery = location ? `?lat=${location.lat}&lng=${location.lng}&radius_km=10` : '';
        const [overviewRes, trendsRes, categoriesRes, severityRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/analytics/overview${locQuery}`),
          fetch(`${BACKEND_URL}/api/analytics/trends?period=${period}${locParams}`),
          fetch(`${BACKEND_URL}/api/analytics/categories${locQuery}`),
          fetch(`${BACKEND_URL}/api/analytics/severity-trends?period=${period}${locParams}`),
        ]);
        const [overview, trendsData, categoriesData, severityData] = await Promise.all([
          overviewRes.json(), trendsRes.json(), categoriesRes.json(), severityRes.json(),
        ]);
        setKpis(overview);
        setTrends(trendsData);
        setCategories(categoriesData);
        setSeverityTrends(severityData);
      } catch (err) {
        console.error('Analytics fetch error:', err);
      } finally {
        setDataLoaded(true);
      }
    }
    fetchAnalytics();
  }, [period, location, locLoading]);

  useEffect(() => {
    if (dataLoaded && animationDone) {
      setLoading(false);
    }
  }, [dataLoaded, animationDone]);

  if (loading) {
    return (
      <AnalyticsLoader 
        dataLoaded={dataLoaded} 
        onComplete={() => setAnimationDone(true)} 
      />
    );
  }

  if (!kpis) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="mx-auto text-[#DCCCAC] mb-3" size={48} />
        <p className="text-[#546B41] font-medium">Analytics data unavailable</p>
        <p className="text-sm text-slate-400 mt-1">Make sure the backend is running.</p>
      </div>
    );
  }

  const statusData = Object.entries(kpis.status_breakdown || {}).map(([name, value]) => ({ name, value }));
  const areaHealthScore = Math.max(0, Math.min(100, Math.round(
    (kpis.resolution_rate * 0.4) + 
    ((1 - (kpis.severity_breakdown.Critical || 0) / Math.max(kpis.total_issues, 1)) * 100 * 0.3) +
    ((kpis.verified / Math.max(kpis.total_issues, 1)) * 100 * 0.3)
  )));

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-[#546B41] tracking-tight">Civic Intelligence Dashboard</h1>
          <p className="text-sm text-[#546B41]/60 mt-1 flex items-center gap-1.5">
            <MapPin size={14} className="text-[#99AD7A]" />
            {location ? `Showing data for ${location.city || location.district || 'your area'}` : 'Real-time analytics and insights'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-[#DCCCAC] rounded-xl p-1 shadow-sm">
          {[
            { label: '7D', value: '7d' },
            { label: '30D', value: '30d' },
            { label: '90D', value: '90d' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                period === opt.value
                  ? 'bg-[#546B41] text-[#FFF8EC] shadow-sm'
                  : 'text-[#546B41]/60 hover:bg-[#546B41]/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KPICard icon={<AlertTriangle size={20} />} label="Total Issues" value={kpis.total_issues} accent="#546B41" subtext={`${kpis.open_issues} open`} />
        <KPICard icon={<CheckCircle size={20} />} label="Resolved" value={kpis.resolved_issues} accent="#99AD7A" subtext={`${kpis.resolution_rate}% rate`} />
        <KPICard icon={<Clock size={20} />} label="Avg Resolution" value={kpis.avg_resolution_hours !== null ? `${kpis.avg_resolution_hours}h` : 'N/A'} accent="#D4A853" subtext="hours to resolve" />
        <KPICard icon={<Users size={20} />} label="Active Users" value={kpis.active_users} accent="#8B6F4E" subtext={`${kpis.verified} verified`} />
        <KPICard icon={<Shield size={20} />} label="Area Health" value={areaHealthScore} accent={areaHealthScore >= 60 ? '#546B41' : areaHealthScore >= 30 ? '#D4A853' : '#C17B3A'} subtext="out of 100" />
      </div>

      {/* ─── Divider ─── */}
      <div className="h-px bg-[#DCCCAC]/60 my-8" />

      {/* ─── Charts Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Issue Trends */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC]/50 p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#546B41]/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-[#546B41]" />
            </div>
            <h3 className="text-sm font-bold text-[#546B41]">Issue Trends</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="colorReported" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#546B41" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#546B41" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#99AD7A" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#99AD7A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCCCAC50" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#546B41' }} tickFormatter={(v) => v.slice(5)} stroke="#DCCCAC" />
              <YAxis tick={{ fontSize: 10, fill: '#546B41' }} stroke="#DCCCAC" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #DCCCAC', fontSize: '12px', background: '#FFF8EC' }} />
              <Area type="monotone" dataKey="reported" stroke="#546B41" fill="url(#colorReported)" strokeWidth={2} name="Reported" />
              <Area type="monotone" dataKey="resolved" stroke="#99AD7A" fill="url(#colorResolved)" strokeWidth={2} name="Resolved" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC]/50 p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#D4A853]/10 flex items-center justify-center">
              <PieChartIcon size={16} className="text-[#D4A853]" />
            </div>
            <h3 className="text-sm font-bold text-[#546B41]">Category Distribution</h3>
          </div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie data={categories} cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={3} dataKey="value">
                  {categories.map((_, index) => (
                    <Cell key={index} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #DCCCAC', fontSize: '12px', background: '#FFF8EC' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {categories.slice(0, 6).map((cat, i) => (
                <div key={cat.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i] }} />
                    <span className="text-[#546B41]/80 truncate max-w-[120px]">{cat.name}</span>
                  </div>
                  <span className="font-bold text-[#546B41]">{cat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Severity Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC]/50 p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <BarChart3 size={16} className="text-red-500" />
            </div>
            <h3 className="text-sm font-bold text-[#546B41]">Severity Breakdown</h3>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
              const count = kpis.severity_breakdown[sev] || 0;
              const colors: Record<string, string> = { Critical: '#dc2626', High: '#ea580c', Medium: '#d97706', Low: '#546B41' };
              return (
                <div key={sev} className="text-center p-3 bg-[#FFF8EC] rounded-xl border border-[#DCCCAC]/30">
                  <div className="text-xl font-black" style={{ color: colors[sev] }}>{count}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#546B41]/50 mt-1">{sev}</div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={[{
              Critical: kpis.severity_breakdown.Critical || 0,
              High: kpis.severity_breakdown.High || 0,
              Medium: kpis.severity_breakdown.Medium || 0,
              Low: kpis.severity_breakdown.Low || 0,
            }]}>
              <Bar dataKey="Critical" fill="#dc2626" radius={[4, 4, 0, 0]} />
              <Bar dataKey="High" fill="#ea580c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Medium" fill="#d97706" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Low" fill="#546B41" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Issues by Status */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC]/50 p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#99AD7A]/10 flex items-center justify-center">
              <Activity size={16} className="text-[#99AD7A]" />
            </div>
            <h3 className="text-sm font-bold text-[#546B41]">Issues by Status</h3>
          </div>
          <div className="space-y-3">
            {statusData.map((entry) => {
              const maxVal = Math.max(...statusData.map(d => d.value), 1);
              const pct = (entry.value / maxVal) * 100;
              const statusColors: Record<string, string> = {
                'Reported': '#546B41', 'AI Verified': '#8B6F4E', 'Community Verified': '#99AD7A',
                'In Progress': '#D4A853', 'Resolved': '#6B8E5A', 'Closed': '#DCCCAC',
              };
              return (
                <div key={entry.name}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-[#546B41]/80">{entry.name}</span>
                    <span className="text-xs font-bold text-[#546B41]">{entry.value}</span>
                  </div>
                  <div className="h-2.5 bg-[#FFF8EC] rounded-full overflow-hidden border border-[#DCCCAC]/30">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: statusColors[entry.name] || '#546B41' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Divider ─── */}
      <div className="h-px bg-[#DCCCAC]/60 my-8" />

      {/* ─── Severity Trends Over Time ─── */}
      {severityTrends.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC]/50 p-6 mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#D4A853]/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-[#D4A853]" />
            </div>
            <h3 className="text-sm font-bold text-[#546B41]">Severity Trends Over Time</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={severityTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCCCAC50" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#546B41' }} tickFormatter={(v) => v.slice(5)} stroke="#DCCCAC" />
              <YAxis tick={{ fontSize: 10, fill: '#546B41' }} stroke="#DCCCAC" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #DCCCAC', fontSize: '12px', background: '#FFF8EC' }} />
              <Line type="monotone" dataKey="Critical" stroke="#dc2626" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="High" stroke="#ea580c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Medium" stroke="#d97706" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Low" stroke="#546B41" strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Predictive Intelligence Banner ─── */}
      <Link to="/predictions" className="block bg-gradient-to-r from-[#546B41] to-[#3A4D2D] rounded-2xl p-6 mb-8 border border-[#99AD7A]/30 hover:border-[#99AD7A]/60 transition-all group shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Brain size={24} className="text-[#FFF8EC] group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#FFF8EC] mb-1">Predictive Intelligence</h3>
              <p className="text-[#99AD7A] text-sm">AI forecasts for hotspots, issue trends, and area risk scores</p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[#FFF8EC] group-hover:bg-[#99AD7A] transition-colors">
            <ChevronRight size={20} />
          </div>
        </div>
      </Link>
    </div>
  );
}

/* ─── KPI Card Component ─── */
function KPICard({ icon, label, value, accent, subtext }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string; subtext?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#DCCCAC]/50 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-extrabold" style={{ color: accent }}>{value}</p>
      <p className="text-xs text-[#546B41]/70 font-semibold mt-1">{label}</p>
      {subtext && <p className="text-[10px] text-[#546B41]/40 mt-0.5">{subtext}</p>}
    </div>
  );
}

function AnalyticsLoader({ dataLoaded, onComplete }: { dataLoaded: boolean, onComplete: () => void }) {
  const steps = [
    "Aggregating Issue Data...",
    "Calculating Resolution Metrics...",
    "Analyzing Category Distributions...",
    "Generating Trends...",
    "Processing Historical Data...",
    "Evaluating Community Impact...",
    "Correlating Data Points...",
    "Generating Insights...",
    "Refining Analytics Models...",
    "Finalizing Dashboard..."
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
        if (prev >= steps.length - 2) return prev;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [dataLoaded, steps.length, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center w-32 h-32">
        <div className="absolute inset-0 rounded-full border-2 border-[#DCCCAC] opacity-30 animate-[spin_4s_linear_infinite]" />
        <div className="absolute inset-2 rounded-full border-2 border-t-[#D4A853] border-r-transparent border-b-[#99AD7A] border-l-transparent animate-[spin_2s_linear_infinite]" />
        
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#546B41] to-[#3A4D2D] flex items-center justify-center shadow-2xl relative overflow-hidden z-10 border border-[#99AD7A]/40">
          <div className="absolute inset-0 bg-[#FFF8EC]/10 animate-pulse" />
          <BarChart3 size={32} className="text-[#FFF8EC]" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="h-8 overflow-hidden w-80 flex justify-center">
          <div className="flex flex-col transition-transform duration-500 ease-out text-center" style={{ transform: `translateY(-${currentStep * 32}px)` }}>
            {steps.map((step, i) => (
              <span key={i} className={`h-8 text-sm font-black uppercase tracking-wider flex items-center justify-center ${i === currentStep ? 'text-[#546B41]' : 'text-[#546B41]/30'}`}>
                {step}
              </span>
            ))}
          </div>
        </div>
        <div className="w-64 h-1.5 bg-[#DCCCAC]/30 rounded-full overflow-hidden shadow-inner relative">
          <div 
            className={`h-full bg-gradient-to-r from-[#D4A853] to-[#546B41] transition-all duration-500 ease-out ${currentStep === steps.length - 1 && !dataLoaded ? 'animate-pulse' : ''}`}
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
