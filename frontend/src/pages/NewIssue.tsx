import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MapPin, CheckCircle, ChevronRight, ChevronLeft, Sparkles, Loader2, AlertTriangle, UploadCloud, XCircle, Crosshair, Brain, Video, Mic, Square, PlayCircle } from 'lucide-react';
import { addDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import Map, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const CATEGORIES = [
  'Road Damage', 'Water Leakage', 'Garbage Overflow', 'Streetlight Failure',
  'Illegal Parking', 'Public Safety', 'Drainage Issue', 'Noise Pollution',
  'Traffic Hazard', 'Vandalism', 'Other',
];

export default function NewIssue() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDataLoaded, setAnalysisDataLoaded] = useState(false);
  const [analysisAnimationDone, setAnalysisAnimationDone] = useState(false);
  const analyzing = isAnalyzing && (!analysisDataLoaded || !analysisAnimationDone);
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Road Damage',
    severity: 'Medium',
    address: '',
    road: '',
    district: '',
    city: '',
    state: '',
    pincode: '',
    lat: 0,
    lng: 0,
  });
  
  const [viewState, setViewState] = useState({ longitude: 77.2090, latitude: 28.6139, zoom: 14 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiRejection, setAiRejection] = useState<string | null>(null);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);

  // Voice Note states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [voiceNoteUploading, setVoiceNoteUploading] = useState(false);
  const [voiceNoteData, setVoiceNoteData] = useState<{
    url: string | null;
    text: string | null;
    lang: string | null;
    english: string | null;
  }>({ url: null, text: null, lang: null, english: null });

  const handleNext = () => setStep(s => Math.min(4, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  const handleFileSelect = async (file: File) => {
    setVideoError(null);
    setAiRejection(null);
    setAiAnalysis(null);
    
    const isVid = file.type.startsWith('video/');
    setIsVideo(isVid);
    
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setMediaUrl(url);

    if (isVid) {
      // Check duration using an in-memory video element to prevent React re-render loops
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (video.duration > 15) {
          setVideoError('Video must be 15 seconds or less.');
          setSelectedFile(null);
          setMediaUrl(null);
        } else {
          analyzeMedia(file);
        }
      };
      video.src = url;
    } else {
      await analyzeMedia(file);
    }
  };

  const analyzeMedia = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisDataLoaded(false);
    setAnalysisAnimationDone(false);
    setAiRejection(null);
    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('description', '');

      const res = await fetch(`${BACKEND_URL}/api/ai/analyze`, {
        method: 'POST',
        body: uploadData,
      });
      const data = await res.json();
      
      if (data.is_civic_issue === false) {
        setAiRejection(data.rejection_reason || 'This media does not appear to depict a valid civic issue.');
        return;
      }
      
      setAiAnalysis(data);

      if (data.title) {
        setFormData(prev => ({
          ...prev,
          title: data.title,
          description: data.description || prev.description,
          category: CATEGORIES.includes(data.category) ? data.category : prev.category,
          severity: data.severity || prev.severity,
        }));
      }
      if (data.media_url) {
        setUploadedMediaUrl(data.media_url.replace(/^http:/i, 'https:'));
      }
    } catch (err) {
      console.error('AI analysis failed:', err);
      setIsAnalyzing(false);
    } finally {
      setAnalysisDataLoaded(true);
    }
  };

  // ─── Milestone 3.5: Duplicate check before submit ─────────────
  const checkForDuplicates = async () => {
    try {
      const issuesSnap = await getDocs(query(collection(db, 'issues'), limit(50)));
      const existingIssues = issuesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      const res = await fetch(`${BACKEND_URL}/api/ai/check-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${formData.title}. ${formData.description}. Category: ${formData.category}. Location: ${formData.address}`,
          existingIssues: existingIssues.map(i => ({
            id: i.id,
            title: (i as any).title,
            embedding: (i as any).embedding || [],
          })),
        }),
      });
      const data = await res.json();
      if (data.is_likely_duplicate) {
        setDuplicateWarning(data);
      }
    } catch (err) {
      console.error('Duplicate check failed:', err);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Upload file if not already uploaded by AI analysis
      let finalMediaUrl = uploadedMediaUrl;
      if (!finalMediaUrl && selectedFile) {
        const uploadData = new FormData();
        uploadData.append('file', selectedFile);
        const res = await fetch(`${BACKEND_URL}/api/upload`, {
          method: 'POST',
          body: uploadData,
        });
        const data = await res.json();
        finalMediaUrl = data.url || null;
      }

      // Generate embedding for duplicate detection on future issues
      let embedding: number[] = [];
      try {
        const embRes = await fetch(`${BACKEND_URL}/api/ai/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${formData.title}. ${formData.description}. ${formData.category}. ${formData.address}`,
          }),
        });
        const embData = await embRes.json();
        embedding = embData.embedding || [];
      } catch (err) {
        console.error('Embedding generation failed:', err);
      }

      const docRef = await addDoc(collection(db, 'issues'), {
        ...formData,
        reporter_id: user?.uid,
        status: 'Reported',
        created_at: new Date(),
        media_urls: finalMediaUrl ? [finalMediaUrl] : [],
        ai_analysis: aiAnalysis || null,
        embedding,
        voice_note_url: voiceNoteData.url,
        voice_note_text: voiceNoteData.text,
        voice_note_lang: voiceNoteData.lang,
        voice_note_english: voiceNoteData.english,
      });

      // Milestone 8: Trigger Agent Pipeline
      try {
        await fetch(`${BACKEND_URL}/api/agents/process-issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issue_id: docRef.id }),
        });
      } catch (err) {
        console.error('Failed to trigger agent pipeline:', err);
      }

      // Milestone 7: Award points for reporting
      if (user?.uid) {
        try {
          await fetch(`${BACKEND_URL}/api/gamification/award`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.uid, action_type: 'report' }),
          });
        } catch (err) {
          console.error('Failed to award points:', err);
        }
      }

      navigate('/');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const fetchLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        setViewState({ longitude, latitude, zoom: 16 });
        setFormData(prev => ({ ...prev, lat: latitude, lng: longitude }));
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const data = await res.json();
          if (data && data.address) {
            setFormData(prev => ({
              ...prev,
              address: data.display_name || '',
              road: data.address.road || data.address.pedestrian || '',
              district: data.address.city_district || data.address.state_district || data.address.county || '',
              city: data.address.city || data.address.town || data.address.village || '',
              state: data.address.state || '',
              pincode: data.address.postcode || '',
            }));
          }
        } catch (err) {
          console.error("Geocoding failed", err);
        }
      });
    }
  };

  useEffect(() => {
    if (step === 2 && formData.lat === 0) {
      fetchLocation();
    }
  }, [step]);
  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-6 transition-all">
      {/* Container: 2-column on desktop. Left side is Step 1 (Upload), Right side is Step 2/3/4 */}
      <div className="lg:grid lg:grid-cols-[360px_1fr] xl:grid-cols-[400px_1fr] lg:gap-6 items-start">
        
        {/* ─── Left Side: Always Visible on Desktop (Upload Media & Heading) ─── */}
        <div className={`w-full bg-[#FFF8EC] shadow-xl rounded-2xl p-5 border border-[#DCCCAC] ${step !== 1 ? 'hidden lg:block' : 'block'} sticky top-4`}>
          <h1 className="text-2xl font-extrabold text-[#546B41] tracking-tight mb-2">Report an Issue</h1>
          <p className="text-sm text-[#546B41]/50 mb-6 leading-relaxed">
            Our AI will help auto-classify your report and detect duplicates to keep our city clean.
          </p>

          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-[#546B41]' : 'bg-[#DCCCAC]/40'}`} />
            ))}
          </div>

          <h2 className="text-lg font-bold text-[#546B41] mb-4 text-center">Upload Photo or Video</h2>
          
          {aiRejection && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 shadow-sm">
              <XCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-xs font-bold text-red-800">Media Rejected</p>
                <p className="text-xs text-red-700 mt-1">{aiRejection}</p>
              </div>
            </div>
          )}
          {videoError && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 shadow-sm">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <p className="text-xs font-medium text-amber-800">{videoError}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="sm:hidden flex flex-row gap-3 w-full">
              <label className="flex-1 border-2 border-dashed border-[#DCCCAC] rounded-xl p-3 hover:bg-[#546B41]/5 cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center bg-white shadow-sm">
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]); }} />
                <Camera size={24} className="text-[#546B41] mb-1" />
                <p className="text-[#546B41] font-semibold text-xs">Take Photo</p>
              </label>
              
              <label className="flex-1 border-2 border-dashed border-[#DCCCAC] rounded-xl p-3 hover:bg-[#546B41]/5 cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center bg-white shadow-sm">
                <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]); }} />
                <Video size={24} className="text-[#546B41] mb-1" />
                <p className="text-[#546B41] font-semibold text-xs">Take Video</p>
                <p className="text-[#546B41]/40 text-[10px] mt-1">Max 15s</p>
              </label>
            </div>
            
            <label className="flex-1 border-2 border-dashed border-[#DCCCAC] rounded-xl p-4 hover:bg-[#546B41]/5 cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center bg-white shadow-sm">
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]); }} />
              <UploadCloud size={24} className="text-[#546B41] mb-1" />
              <p className="text-[#546B41] font-semibold text-xs">Upload from Gallery</p>
              <p className="text-[#546B41]/40 text-[10px] mt-1">Max 15s</p>
            </label>
          </div>

          <div className="min-h-[180px] border border-[#DCCCAC] bg-black rounded-xl p-1 flex items-center justify-center relative overflow-hidden shadow-inner">
            {analyzing ? (
              <MediaAnalysisLoader 
                dataLoaded={analysisDataLoaded} 
                onComplete={() => {
                  setAnalysisAnimationDone(true);
                  if (analysisDataLoaded) setIsAnalyzing(false);
                }} 
              />
            ) : mediaUrl ? (
              isVideo ? (
                <video ref={videoRef} src={mediaUrl} controls autoPlay playsInline muted loop className="w-full h-44 object-contain rounded-lg" />
              ) : (
                <img src={mediaUrl} alt="Preview" className="w-full h-44 object-contain rounded-lg bg-white" />
              )
            ) : (
              <p className="text-[#546B41]/40 text-xs italic font-medium">No media selected yet</p>
            )}
          </div>

          {/* AI Analysis Result Badge */}
          {aiAnalysis && !analyzing && (
            <div className="mt-6 bg-[#546B41]/10 border border-[#546B41]/20 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-[#546B41]" />
                <span className="text-sm font-bold text-[#546B41]">AI Auto-Filled</span>
                <span className="ml-auto text-xs font-bold bg-[#546B41] text-[#FFF8EC] px-2.5 py-1 rounded-full shadow-sm">
                  {Math.round((aiAnalysis.confidence || 0) * 100)}% Match
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-[#546B41]/70 text-[10px] uppercase font-bold tracking-widest">Category</span><br/><span className="font-semibold text-[#546B41]/80">{aiAnalysis.category}</span></div>
                <div><span className="text-[#546B41]/70 text-[10px] uppercase font-bold tracking-widest">Severity</span><br/><span className={`font-bold ${aiAnalysis.severity === 'Critical' ? 'text-red-600' : aiAnalysis.severity === 'High' ? 'text-orange-600' : 'text-[#546B41]'}`}>{aiAnalysis.severity}</span></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <button onClick={handleNext} disabled={analyzing || !selectedFile || aiRejection !== null || videoError !== null} className="mt-8 w-full py-4 bg-[#546B41] hover:bg-[#435733] disabled:opacity-50 disabled:bg-[#DCCCAC] text-[#FFF8EC] rounded-xl flex justify-center items-center gap-2 font-bold shadow-md transition-all active:scale-[0.98] lg:hidden">
              Continue to Location <ChevronRight size={18} />
            </button>
          )}
        </div>

        {/* ─── Right Column (Steps 2, 3, 4) ─── */}
        <div className={`w-full bg-[#FFF8EC] shadow-xl rounded-2xl p-6 lg:p-8 border border-[#DCCCAC] min-h-[400px] ${step === 1 && !aiAnalysis ? 'hidden lg:flex flex-col items-center justify-center opacity-50' : step === 1 && aiAnalysis ? 'hidden lg:block' : 'block'}`}>
          
          {step === 1 && !aiAnalysis && (
            <div className="text-center">
              <Camera size={48} className="text-[#DCCCAC] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-[#546B41] mb-2">Upload Media to Start</h2>
              <p className="text-[#546B41]/50">Please upload a photo or video of the issue first.</p>
              <button onClick={handleNext} disabled={analyzing || !selectedFile || aiRejection !== null || videoError !== null} className="mt-8 px-8 py-4 bg-[#546B41] hover:bg-[#435733] disabled:opacity-50 disabled:bg-[#DCCCAC] text-[#FFF8EC] rounded-xl inline-flex justify-center items-center gap-2 font-bold shadow-md transition-all active:scale-[0.98]">
                Continue to Location <ChevronRight size={18} />
              </button>
            </div>
          )}

          {step === 1 && aiAnalysis && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[#546B41]" />
                  <h2 className="text-lg font-bold text-[#546B41]">AI Analysis Complete</h2>
                </div>
                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">{Math.round((aiAnalysis.confidence || 0) * 100)}% Match</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-[#DCCCAC]/40 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[#546B41]/40 font-bold">Category</div>
                  <div className="text-sm font-bold text-[#546B41]/80 mt-0.5">{aiAnalysis.category || formData.category}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-[#DCCCAC]/40 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[#546B41]/40 font-bold">Severity</div>
                  <div className={`text-sm font-bold mt-0.5 ${formData.severity === 'Critical' ? 'text-red-600' : formData.severity === 'High' ? 'text-orange-500' : 'text-[#546B41]'}`}>{formData.severity}</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-[#DCCCAC]/40 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[#546B41]/40 font-bold">Danger Score</div>
                  <div className={`text-lg font-black ${(aiAnalysis.danger_score || 0) >= 7 ? 'text-red-600' : (aiAnalysis.danger_score || 0) >= 4 ? 'text-orange-500' : 'text-[#546B41]'}`}>{aiAnalysis.danger_score}/10</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-[#DCCCAC]/40 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[#546B41]/40 font-bold">Title</div>
                  <div className="text-xs font-semibold text-[#546B41]/70 mt-0.5 line-clamp-2">{aiAnalysis.title || formData.title}</div>
                </div>
              </div>

              {aiAnalysis.recommended_action && (
                <div className="bg-white/80 rounded-lg p-3 border border-[#DCCCAC]/30">
                  <div className="text-[10px] uppercase tracking-wider text-[#546B41]/40 font-bold mb-1">Recommended Action</div>
                  <p className="text-xs text-[#546B41]/70 font-medium leading-relaxed">{aiAnalysis.recommended_action}</p>
                </div>
              )}

              <button onClick={handleNext} className="w-full py-3.5 bg-[#546B41] hover:bg-[#435733] text-[#FFF8EC] rounded-xl flex justify-center items-center gap-2 font-bold shadow-md transition-all active:scale-[0.98]">
                Continue to Location <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* ─── Step 2: Location (Map and Fields side-by-side) ─── */}
          {step === 2 && (
            <div className="w-full h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-[#546B41]">Pinpoint Location</h2>
              </div>
              <p className="text-sm text-[#546B41]/50 mb-6">Tap on the map to drop a pin, or use the <strong>crosshair</strong> button to detect your GPS location.</p>
              
              <div className="flex-1 lg:grid lg:grid-cols-2 gap-8 items-start">
                <div className="h-64 lg:h-[350px] rounded-xl overflow-hidden mb-6 lg:mb-0 border-2 border-[#DCCCAC] shadow-inner relative cursor-crosshair">
                  <Map
                    {...viewState}
                    onMove={evt => setViewState(evt.viewState)}
                    onClick={async (evt) => {
                      const { lng, lat } = evt.lngLat;
                      setFormData(prev => ({ ...prev, lat, lng }));
                      setViewState(prev => ({ ...prev, longitude: lng, latitude: lat }));
                      try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
                        const data = await res.json();
                        if (data && data.address) {
                          setFormData(prev => ({
                            ...prev,
                            lat, lng,
                            address: data.display_name || '',
                            road: data.address.road || data.address.pedestrian || '',
                            district: data.address.city_district || data.address.state_district || data.address.county || '',
                            city: data.address.city || data.address.town || data.address.village || '',
                            state: data.address.state || '',
                            pincode: data.address.postcode || '',
                          }));
                        }
                      } catch (err) {
                        console.error("Reverse geocoding failed:", err);
                      }
                    }}
                    mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                  >
                    <Marker
                      longitude={formData.lng}
                      latitude={formData.lat}
                      anchor="bottom"
                      draggable={true}
                      onDragEnd={async (evt) => {
                        const { lng, lat } = evt.lngLat;
                        setFormData(prev => ({ ...prev, lat, lng }));
                        try {
                          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
                          const data = await res.json();
                          if (data && data.address) {
                            setFormData(prev => ({
                              ...prev,
                              lat, lng,
                              address: data.display_name || '',
                              road: data.address.road || data.address.pedestrian || '',
                              district: data.address.city_district || data.address.state_district || data.address.county || '',
                              city: data.address.city || data.address.town || data.address.village || '',
                              state: data.address.state || '',
                              pincode: data.address.postcode || '',
                            }));
                          }
                        } catch (err) {
                          console.error("Reverse geocoding failed:", err);
                        }
                      }}
                    >
                      <div className="text-red-500 animate-bounce">
                        <MapPin size={32} fill="#EF4444" className="text-white" />
                      </div>
                    </Marker>
                  </Map>
                  <button onClick={fetchLocation} className="absolute bottom-4 right-4 bg-white p-2 rounded-full shadow-md border border-[#DCCCAC]/30 hover:bg-[#FFF8EC]" title="Use my GPS location">
                    <Crosshair size={20} className="text-[#546B41]" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Full Address / Landmark</label>
                    <input
                      type="text"
                      placeholder="Enter address or nearest landmark"
                      className="w-full px-4 py-3 border border-[#DCCCAC] rounded-lg focus:ring-2 focus:ring-[#546B41] outline-none transition-all shadow-sm bg-white"
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Road/Area</label>
                      <input type="text" className="w-full px-3 py-2 border border-[#DCCCAC] rounded-lg text-sm outline-none bg-white" value={formData.road} onChange={e => setFormData({ ...formData, road: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">District</label>
                      <input type="text" className="w-full px-3 py-2 border border-[#DCCCAC] rounded-lg text-sm outline-none bg-white" value={formData.district} onChange={e => setFormData({ ...formData, district: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">City</label>
                      <input type="text" className="w-full px-3 py-2 border border-[#DCCCAC] rounded-lg text-sm outline-none bg-white" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Pincode</label>
                      <input type="text" className="w-full px-3 py-2 border border-[#DCCCAC] rounded-lg text-sm outline-none bg-white" value={formData.pincode} onChange={e => setFormData({ ...formData, pincode: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8 lg:mt-auto pt-8">
                <button onClick={handlePrev} className="flex-1 py-4 bg-white border border-[#DCCCAC] hover:bg-slate-50 text-[#546B41] rounded-xl flex justify-center items-center gap-2 font-bold shadow-sm transition-all lg:hidden">
                  <ChevronLeft size={18} /> Back
                </button>
                <button onClick={handleNext} disabled={!formData.address} className="flex-1 py-4 bg-[#546B41] hover:bg-[#435733] disabled:opacity-50 text-[#FFF8EC] rounded-xl flex justify-center items-center gap-2 font-bold shadow-md transition-all active:scale-[0.98]">
                  Continue <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Details (Fields side-by-side) ─── */}
          {step === 3 && (
            <div className="w-full h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-[#546B41]">Issue Details</h2>
              </div>
              {aiAnalysis && (
                <div className="flex justify-start mb-6">
                  <p className="text-xs text-[#546B41] flex items-center gap-1 font-semibold bg-[#546B41]/10 py-1.5 px-3 rounded-full"><Sparkles size={14} /> AI pre-filled these fields</p>
                </div>
              )}
              
              <div className="flex-1 lg:grid lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Category</label>
                    <select
                      className="w-full px-4 py-3 border border-[#DCCCAC] rounded-lg focus:ring-2 focus:ring-[#546B41] outline-none bg-white shadow-sm"
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Severity</label>
                    <select
                      className="w-full px-4 py-3 border border-[#DCCCAC] rounded-lg focus:ring-2 focus:ring-[#546B41] outline-none bg-white shadow-sm"
                      value={formData.severity}
                      onChange={e => setFormData({ ...formData, severity: e.target.value })}
                    >
                      <option>Critical</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Title</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 border border-[#DCCCAC] rounded-lg focus:ring-2 focus:ring-[#546B41] outline-none shadow-sm bg-white"
                      placeholder="E.g., Large pothole on MG Road"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="h-full pt-4 lg:pt-0">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-1">Description</label>
                  <textarea
                    className="w-full px-4 py-3 border border-[#DCCCAC] rounded-lg focus:ring-2 focus:ring-[#546B41] outline-none h-[150px] resize-none shadow-sm bg-white mb-4"
                    placeholder="Describe the issue in detail..."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />

                  {/* Voice Note Recorder */}
                  <div className="bg-[#546B41]/5 rounded-xl border border-[#DCCCAC]/50 p-4 shadow-sm">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#546B41]/70 mb-2">Voice Note (Optional)</label>
                    <div className="flex items-center gap-3">
                      {!isRecording && !voiceNoteData.url && !voiceNoteUploading && (
                        <button
                          onClick={async () => {
                            try {
                              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                              const recorder = new MediaRecorder(stream);
                              const chunks: BlobPart[] = [];
                              recorder.ondataavailable = e => chunks.push(e.data);
                              recorder.onstop = async () => {
                                setVoiceNoteUploading(true);
                                const blob = new Blob(chunks, { type: 'audio/webm' });
                                const uploadData = new FormData();
                                uploadData.append('file', blob, 'voicenote.webm');
                                try {
                                  const res = await fetch(`${BACKEND_URL}/api/ai/transcribe`, {
                                    method: 'POST',
                                    body: uploadData
                                  });
                                  const data = await res.json();
                                  setVoiceNoteData({
                                    url: data.audio_url,
                                    text: data.transcription,
                                    lang: data.language_detected,
                                    english: data.english_translation
                                  });
                                } catch (err) {
                                  console.error("Voice note upload failed:", err);
                                } finally {
                                  setVoiceNoteUploading(false);
                                  stream.getTracks().forEach(track => track.stop());
                                }
                              };
                              recorder.start();
                              setMediaRecorder(recorder);
                              setIsRecording(true);
                            } catch (err) {
                              console.error("Could not start recording:", err);
                              alert("Microphone permission denied or unavailable.");
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#546B41] hover:bg-[#435733] text-white font-semibold text-sm transition-all"
                        >
                          <Mic size={16} /> Record Audio
                        </button>
                      )}

                      {isRecording && (
                        <button
                          onClick={() => {
                            if (mediaRecorder) {
                              mediaRecorder.stop();
                              setIsRecording(false);
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-all animate-pulse"
                        >
                          <Square size={16} /> Stop Recording
                        </button>
                      )}

                      {voiceNoteUploading && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#546B41]">
                          <Loader2 size={16} className="animate-spin" /> Processing Audio...
                        </div>
                      )}

                      {voiceNoteData.url && !voiceNoteUploading && (
                        <div className="flex-1">
                          <audio src={voiceNoteData.url} controls className="h-10 w-full rounded-md" />
                          <div className="mt-1 flex justify-between items-center">
                            <span className="text-xs font-semibold text-[#546B41]">
                              Language: {voiceNoteData.lang}
                            </span>
                            <button
                              onClick={() => setVoiceNoteData({ url: null, text: null, lang: null, english: null })}
                              className="text-xs text-red-500 hover:underline font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {voiceNoteData.text && (
                      <div className="mt-3 p-2 bg-white rounded-md border border-[#DCCCAC]/40 text-xs italic text-[#546B41]/80 max-h-20 overflow-y-auto">
                        "{voiceNoteData.text}"
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4 mt-8 lg:mt-auto pt-8">
                <button onClick={handlePrev} className="flex-1 py-4 bg-white border border-[#DCCCAC] hover:bg-slate-50 text-[#546B41] rounded-xl flex justify-center items-center gap-2 font-bold shadow-sm transition-all">Back</button>
                <button onClick={() => { checkForDuplicates(); handleNext(); }} className="flex-1 py-4 bg-[#546B41] hover:bg-[#435733] text-[#FFF8EC] rounded-xl font-bold shadow-md transition-all active:scale-[0.98]">Review</button>
              </div>
            </div>
          )}

          {/* ─── Step 4: Review & Submit ─── */}
          {step === 4 && (
            <div className="w-full flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-[#546B41]">Review & Submit</h2>
              </div>

              {/* Duplicate Warning */}
              {duplicateWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-start gap-3 shadow-sm">
                  <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs font-bold text-amber-800">Possible duplicate detected</p>
                    <p className="text-[11px] text-amber-700 mt-0.5 font-medium">A similar issue may already exist. You can still submit if this is a new occurrence.</p>
                  </div>
                </div>
              )}

              {/* Compact media + title row */}
              <div className="flex gap-4 mb-4">
                {mediaUrl && (
                  <div className="w-28 h-20 shrink-0 rounded-lg overflow-hidden border border-[#DCCCAC] bg-black">
                    {isVideo ? (
                      <video src={mediaUrl} muted playsInline className="w-full h-full object-cover" />
                    ) : (
                      <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-[#546B41] leading-tight mb-1 line-clamp-2">{formData.title}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${formData.severity === 'Critical' ? 'text-red-700 bg-red-100' : formData.severity === 'High' ? 'text-orange-700 bg-orange-100' : 'text-[#546B41] bg-[#546B41]/10'}`}>{formData.severity}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-[#546B41]/60">{formData.category}</span>
                  </div>
                </div>
              </div>

              {/* Info grid — location, description */}
              <div className="bg-white rounded-xl p-4 space-y-3 text-sm border border-[#DCCCAC]/60 mb-4">
                <div>
                  <span className="text-[#546B41]/60 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1"><MapPin size={11} /> Location</span>
                  <span className="text-[#546B41]/80 font-medium text-xs block mt-0.5 leading-tight">{formData.address || 'Not specified'}</span>
                </div>
                <hr className="border-[#DCCCAC]/30" />
                <div>
                  <span className="text-[#546B41]/60 font-bold uppercase tracking-wider text-[10px]">Description</span>
                  <p className="text-[#546B41]/70 text-xs font-medium leading-relaxed mt-0.5">{formData.description}</p>
                </div>
                
                {voiceNoteData.url && (
                  <>
                    <hr className="border-[#DCCCAC]/30" />
                    <div>
                      <span className="text-[#546B41]/60 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1"><Mic size={11} /> Voice Note</span>
                      <audio src={voiceNoteData.url} controls className="h-8 w-full rounded-md mt-2" />
                      <div className="bg-slate-50 border border-slate-100 rounded p-2 mt-2">
                        <p className="text-xs italic text-[#546B41]/80 leading-relaxed">"{voiceNoteData.text}"</p>
                        {voiceNoteData.english && voiceNoteData.english !== voiceNoteData.text && (
                          <p className="text-[10px] text-slate-500 mt-1 border-t border-slate-200 pt-1">
                            <strong>English:</strong> "{voiceNoteData.english}"
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* AI Analysis Card */}
              {aiAnalysis && (
                <div className="bg-gradient-to-r from-[#546B41]/10 to-emerald-50 rounded-xl p-4 border border-[#546B41]/20 shadow-sm flex flex-col gap-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#546B41]">
                      <Sparkles size={14} />
                      AI Analysis
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{Math.round((aiAnalysis.confidence || 0) * 100)}% Confidence</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/70 rounded-lg p-2 text-center border border-[#DCCCAC]/40">
                      <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold">Danger</div>
                      <div className={`text-base font-black ${(aiAnalysis.danger_score || 0) >= 7 ? 'text-red-600' : (aiAnalysis.danger_score || 0) >= 4 ? 'text-orange-500' : 'text-[#546B41]'}`}>{aiAnalysis.danger_score}/10</div>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 text-center border border-[#DCCCAC]/40">
                      <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold">Radius</div>
                      <div className="text-xs font-bold text-[#546B41]/70 mt-0.5">{aiAnalysis.estimated_affected_radius_meters || '—'}m</div>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 text-center border border-[#DCCCAC]/40">
                      <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold">Response</div>
                      <div className="text-[10px] font-bold text-[#546B41]/70 mt-0.5">{formData.severity === 'Critical' ? '2-4 hrs' : formData.severity === 'High' ? '24 hrs' : formData.severity === 'Medium' ? '3-5 days' : '7-14 days'}</div>
                    </div>
                  </div>

                  {aiAnalysis.danger_breakdown && (
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { label: 'Pedestrian', key: 'pedestrian_traffic_risk' },
                        { label: 'Scale', key: 'scale_size' },
                        { label: 'Structural', key: 'structural_integrity_risk' },
                        { label: 'Health', key: 'environmental_health_hazard' },
                        { label: 'Access', key: 'mobility_access_impact' },
                      ].map(dim => (
                        <div key={dim.key} className="text-center">
                          <div className="text-[8px] text-[#546B41]/40 font-semibold truncate">{dim.label}</div>
                          <div className="h-1 bg-slate-200 rounded-full mt-0.5 overflow-hidden">
                            <div className="h-full rounded-full bg-[#546B41] transition-all" style={{ width: `${((aiAnalysis.danger_breakdown[dim.key] || 0) / 2) * 100}%` }} />
                          </div>
                          <div className="text-[9px] font-bold text-[#546B41]/50 mt-0.5">{aiAnalysis.danger_breakdown[dim.key] || 0}/2</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.recommended_action && (
                    <div className="bg-white/60 rounded-lg p-2.5 border border-[#DCCCAC]/30">
                      <div className="text-[9px] uppercase tracking-wider text-[#546B41]/40 font-bold mb-0.5">Recommended Action</div>
                      <p className="text-[11px] text-[#546B41]/70 font-medium leading-relaxed">{aiAnalysis.recommended_action}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-auto pt-4">
                <button onClick={handlePrev} className="flex-1 py-3.5 bg-white border border-[#DCCCAC] hover:bg-slate-50 text-[#546B41] rounded-xl font-bold shadow-sm transition-all">Edit</button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-3.5 bg-[#546B41] hover:bg-[#435733] text-[#FFF8EC] rounded-xl flex justify-center items-center gap-2 font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:bg-[#DCCCAC]"
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><CheckCircle size={16} /> Submit Report</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MediaAnalysisLoader({ dataLoaded, onComplete }: { dataLoaded: boolean, onComplete: () => void }) {
  const steps = [
    "Extracting Media Metadata...",
    "Scanning Visual Elements...",
    "Detecting Issue Signatures...",
    "Cross-referencing Database...",
    "Estimating Severity...",
    "Generating Descriptions...",
    "Finalizing Analysis..."
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
    <div className="flex flex-col items-center justify-center gap-6 py-6 z-10 relative">
      <div className="relative flex items-center justify-center w-20 h-20">
        <div className="absolute inset-0 rounded-full border-2 border-[#DCCCAC] opacity-30 animate-[spin_4s_linear_infinite]" />
        <div className="absolute inset-2 rounded-full border-2 border-t-[#FFF8EC] border-r-transparent border-b-[#99AD7A] border-l-transparent animate-[spin_2s_linear_infinite]" />
        
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#546B41] to-[#3A4D2D] flex items-center justify-center shadow-2xl relative overflow-hidden z-10 border border-[#99AD7A]/40">
          <div className="absolute inset-0 bg-[#FFF8EC]/10 animate-pulse" />
          <Brain size={24} className="text-[#FFF8EC]" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="h-6 overflow-hidden w-64 flex justify-center">
          <div className="flex flex-col transition-transform duration-500 ease-out text-center" style={{ transform: `translateY(-${currentStep * 24}px)` }}>
            {steps.map((step, i) => (
              <span key={i} className={`h-6 text-xs font-black uppercase tracking-wider flex items-center justify-center ${i === currentStep ? 'text-[#FFF8EC]' : 'text-[#FFF8EC]/40'}`}>
                {step}
              </span>
            ))}
          </div>
        </div>
        <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden relative">
          <div 
            className={`h-full bg-gradient-to-r from-[#FFF8EC] to-[#99AD7A] transition-all duration-500 ease-out ${currentStep === steps.length - 1 && !dataLoaded ? 'animate-pulse' : ''}`}
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
