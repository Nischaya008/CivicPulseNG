import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MapPin, AlertTriangle, Clock, Sparkles, Filter, Search, X, ChevronDown, Crosshair } from 'lucide-react';
import { Link } from 'react-router-dom';
import Map, { Marker, Popup, AttributionControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High: 'bg-orange-100 text-orange-700 border-orange-200',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Low: 'bg-green-100 text-green-700 border-green-200',
  Normal: 'bg-[#DCCCAC]/30 text-[#546B41] border-[#DCCCAC]',
};

const MARKER_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
  Normal: '#546B41',
};

const STATUS_COLORS: Record<string, string> = {
  Reported: 'bg-blue-500',
  'AI Verified': 'bg-indigo-500',
  'Community Verified': 'bg-emerald-500',
  Assigned: 'bg-amber-500',
  'In Progress': 'bg-cyan-500',
  Resolved: 'bg-[#546B41]',
  Closed: 'bg-slate-400',
};

const CATEGORIES = [
  'All', 'Road Damage', 'Water Leakage', 'Garbage Overflow', 'Streetlight Failure',
  'Illegal Parking', 'Public Safety', 'Drainage Issue', 'Noise Pollution',
  'Traffic Hazard', 'Vandalism', 'Other',
];

const STATUSES = ['All', 'Reported', 'Community Verified', 'In Progress', 'Resolved', 'Closed'];

export default function Feed() {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [sortBy, setSortBy] = useState<'date' | 'severity'>('date');

  // Map state
  const [viewState, setViewState] = useState({
    longitude: 77.209,
    latitude: 28.6139,
    zoom: 14,
  });
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [hoveredIssue, setHoveredIssue] = useState<any>(null);

  useEffect(() => {
    // Request location immediately
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setViewState(v => ({
          ...v,
          longitude: coords.lng,
          latitude: coords.lat,
          zoom: 13,
        }));
      },
      (err) => console.warn('Geolocation denied or failed', err),
    );

    const q = query(
      collection(db, 'issues'),
      orderBy('created_at', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setIssues(data);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe to issues:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const locateMe = () => {
    if (userLocation) {
      setViewState(v => ({ ...v, longitude: userLocation.lng, latitude: userLocation.lat, zoom: 14 }));
    } else {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(coords);
          setViewState(v => ({ ...v, longitude: coords.lng, latitude: coords.lat, zoom: 14 }));
        }
      );
    }
  };

  const filteredIssues = issues.filter((i) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = i.title?.toLowerCase().includes(q);
      const matchesCategory = i.category?.toLowerCase().includes(q);
      const matchesAddress = i.address?.toLowerCase().includes(q);
      const matchesDesc = i.description?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesCategory && !matchesAddress && !matchesDesc) return false;
    }
    if (filterCategory !== 'All' && i.category !== filterCategory) return false;
    if (filterStatus !== 'All' && i.status !== filterStatus) return false;
    if (filterSeverity !== 'All' && i.severity !== filterSeverity) return false;
    return true;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    if (sortBy === 'severity') {
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
    }
    return 0;
  });

  const activeFilters = [filterCategory, filterStatus, filterSeverity].filter((f) => f !== 'All').length;

  return (
    <>
      {/* ─── Map Section ─── */}
      <div className="grid-map panel relative border border-[#DCCCAC]">
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        >
          <AttributionControl compact={true} position="bottom-right" />
          
          {/* User Location Marker */}
          {userLocation && (
            <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
              <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
            </Marker>
          )}

          {/* Issue Markers */}
          {filteredIssues.map(issue => {
            if (!issue.lat || !issue.lng) return null;
            return (
              <Marker
                key={issue.id}
                longitude={issue.lng}
                latitude={issue.lat}
                anchor="bottom"
              >
                <div
                  className="group relative cursor-pointer"
                  onMouseEnter={() => setHoveredIssue(issue)}
                  onMouseLeave={() => setHoveredIssue(null)}
                >
                  <div
                    className="w-5 h-5 rounded-full border-[3px] border-white shadow-md transition-all duration-200 group-hover:scale-125 group-hover:-translate-y-1"
                    style={{ 
                      backgroundColor: MARKER_COLORS[issue.severity] || MARKER_COLORS.Normal,
                      animation: hoveredIssue?.id === issue.id ? 'bounce 0.3s infinite alternate' : 'none'
                    }}
                  />
                  {/* Pseudo pin-point */}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-2 bg-slate-800 rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Marker>
            );
          })}

          {hoveredIssue && (
            <Popup
              longitude={hoveredIssue.lng}
              latitude={hoveredIssue.lat}
              closeButton={false}
              anchor="bottom"
              offset={15}
              className="z-50"
            >
              <div className="px-2 py-1 bg-white rounded shadow-sm text-center border border-[#DCCCAC]">
                <p className="font-bold text-[#546B41] text-xs uppercase tracking-wider">{hoveredIssue.category || 'Issue'}</p>
              </div>
            </Popup>
          )}
        </Map>

        <button
          onClick={locateMe}
          className="absolute top-4 right-4 w-10 h-10 bg-white shadow-lg rounded-xl flex items-center justify-center hover:bg-[#FFF8EC] transition-colors border border-[#DCCCAC] text-[#546B41]"
          title="Go to my location"
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* ─── Feed Section ─── */}
      <div className="grid-issues panel bg-[#FFF8EC] border border-[#DCCCAC] flex flex-col overflow-hidden">
        <div className="px-3 py-2 shrink-0 bg-[#FFF8EC] z-10 shadow-sm border-b border-[#DCCCAC]/50">
          <div className="flex justify-between items-center mb-1.5">
            <h1 className="text-base font-black text-[#546B41] tracking-tight uppercase flex items-center gap-2">
              Live Feed
              <span className="text-[9px] font-bold text-[#99AD7A] bg-[#546B41]/10 px-2 py-1 rounded-md flex items-center gap-2 border border-[#546B41]/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#546B41] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#546B41]"></span>
                </span>
                {sortedIssues.length} found
              </span>
            </h1>
            <button
              onClick={() => setSortBy(sortBy === 'date' ? 'severity' : 'date')}
              className="flex items-center gap-1 text-[9px] font-bold text-[#546B41] uppercase tracking-wider hover:text-[#546B41]/70"
            >
              Sort: {sortBy === 'date' ? 'Latest' : 'Severity'}
              <ChevronDown size={10} />
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#546B41]/50" />
              <input
                type="text"
                placeholder="Search issues..."
                className="w-full pl-7 pr-7 py-1 bg-white border border-[#DCCCAC] rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#546B41]/30 focus:border-[#546B41] outline-none transition-all placeholder:text-[#546B41]/40 text-[#546B41]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#546B41]/50 hover:text-[#546B41]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors border ${
                showFilters || activeFilters > 0
                  ? 'bg-[#546B41] text-[#FFF8EC] border-[#546B41]'
                  : 'bg-white text-[#546B41] border-[#DCCCAC] hover:bg-[#DCCCAC]/20'
              }`}
            >
              <Filter size={12} />
              {activeFilters > 0 && (
                <span className="w-3 h-3 bg-[#FFF8EC] text-[#546B41] text-[8px] rounded-full flex items-center justify-center shadow-sm">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="bg-white rounded-xl shadow-sm border border-[#DCCCAC] p-3 mb-2 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#99AD7A] mb-1 block">Category</label>
                  <select
                    className="w-full px-2 py-1.5 border border-[#DCCCAC]/50 rounded-lg text-xs font-medium text-[#546B41] bg-[#FFF8EC]/50 focus:ring-1 focus:ring-[#546B41] outline-none"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-[#99AD7A] mb-1 block">Severity</label>
                  <select
                    className="w-full px-2 py-1.5 border border-[#DCCCAC]/50 rounded-lg text-xs font-medium text-[#546B41] bg-[#FFF8EC]/50 focus:ring-1 focus:ring-[#546B41] outline-none"
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                  >
                    {['All', 'Critical', 'High', 'Medium', 'Low'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterCategory('All'); setFilterStatus('All'); setFilterSeverity('All'); }}
                  className="mt-2 text-[9px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-[#546B41] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sortedIssues.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center border border-[#DCCCAC] mt-2">
              <AlertTriangle className="mx-auto text-[#99AD7A] mb-2" size={24} />
              <h3 className="text-xs font-black text-[#546B41] uppercase tracking-tight mb-1">
                {searchQuery || activeFilters > 0 ? 'No matching issues' : 'No issues reported'}
              </h3>
              <p className="text-[#99AD7A] text-[10px] font-medium">
                {searchQuery || activeFilters > 0
                  ? 'Try adjusting your search or filters.'
                  : 'Be the first to report an issue in your area.'}
              </p>
            </div>
          ) : (
            sortedIssues.map((issue) => (
              <Link
                key={issue.id}
                to={`/issue/${issue.id}`}
                className="block group"
                onMouseEnter={() => setHoveredIssue(issue)}
                onMouseLeave={() => setHoveredIssue(null)}
              >
                <div className={`bg-white rounded-xl p-3 border transition-all duration-200 ${hoveredIssue?.id === issue.id ? 'border-[#546B41] shadow-md -translate-y-0.5' : 'border-[#DCCCAC]/60 shadow-sm hover:border-[#99AD7A]'}`}>
                  <div className="flex gap-3">
                    {issue.media_urls?.[0] ? (
                      issue.media_urls[0].match(/\.(mp4|webm|mov|avi)($|\?)/i) ? (
                        <video src={issue.media_urls[0].replace(/^http:/i, 'https:')} className="w-12 h-12 object-cover rounded-xl bg-black shrink-0" autoPlay loop muted playsInline />
                      ) : (
                        <img src={issue.media_urls[0].replace(/^http:/i, 'https:')} alt="Issue" className="w-12 h-12 object-cover rounded-xl bg-[#FFF8EC] shrink-0" />
                      )
                    ) : (
                      <div className="w-12 h-12 bg-[#FFF8EC] border border-[#DCCCAC]/50 rounded-xl flex items-center justify-center text-[#99AD7A] shrink-0">
                        <MapPin size={16} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <h3 className="font-bold text-[#1e293b] text-xs line-clamp-1 group-hover:text-[#546B41] transition-colors">{issue.title || 'Untitled Issue'}</h3>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border shrink-0 ${SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.Normal}`}>
                          {issue.severity || 'Normal'}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#546B41]/70 line-clamp-2 font-medium leading-relaxed">{issue.description}</p>
                      
                      <div className="mt-2 flex items-center gap-x-2 gap-y-1 text-[9px] font-semibold text-[#99AD7A] flex-wrap uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <div className={`w-1 h-1 rounded-full ${STATUS_COLORS[issue.status] || 'bg-slate-400'}`} />
                          <span className="text-slate-600">{issue.status}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[#546B41]">
                          <Clock size={8} />
                          <span>{issue.created_at?.toDate?.().toLocaleDateString?.() || 'Recent'}</span>
                        </div>
                        {issue.ai_analysis && (
                          <div className="flex items-center gap-1 text-indigo-500">
                            <Sparkles size={8} />
                            <span>AI Verified</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

