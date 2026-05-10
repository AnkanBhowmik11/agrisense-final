import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../state/AppContext';
import { useTelemetry } from '../../state/TelemetryContext';
import { askGemini } from '../../api/aiService';
import { visionBackendEndpoints } from '../../utils/visionBackendUrl';
import { buildAuditPDF, downloadAuditPDF } from '../../utils/pdfReportGenerator';
import {
  Sparkles, Download, ClipboardList, Loader2,
  CheckCircle, AlertTriangle, Camera, Database,
  Sprout, CloudSun, Droplets, Cpu, Activity,
  MapPin, Clock, User, FileText, RefreshCw,
  ChevronRight, BarChart3, Shield, Zap
} from 'lucide-react';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts';

// ─── STEP INDICATOR ─────────────────────────────────────────────────────────
const Step = ({ label, icon: Icon, done, active }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: done ? 'var(--primary)' : active ? 'var(--primary-soft)' : 'var(--bg-sheet)',
      border: `2px solid ${done || active ? 'var(--primary)' : 'var(--border-main)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.3s'
    }}>
      {done
        ? <CheckCircle size={18} color="#fff" />
        : <Icon size={16} color={active ? 'var(--primary)' : 'var(--text-inactive)'} />}
    </div>
    <span style={{ fontSize: '0.55rem', fontWeight: 800, color: done || active ? 'var(--primary)' : 'var(--text-inactive)', textTransform: 'uppercase', textAlign: 'center' }}>
      {label}
    </span>
  </div>
);

// ─── STAT CARD ──────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color = 'var(--primary)', sub }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-stroke)', borderRadius: 20, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 36, height: 36, borderRadius: 12, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
    </div>
    <div style={{ fontSize: '1.4rem', fontWeight: 950, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

// ─── CHART WRAPPER ───────────────────────────────────────────────────────────
const MiniChart = ({ data, dataKey, color, label }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-stroke)', borderRadius: 20, padding: '1rem' }}>
    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: 12 }}>{label}</div>
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-main)" />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
        <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--glass-stroke)', borderRadius: 10, fontSize: 11 }} />
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#g-${dataKey})`} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const sv = (v, u = '', d = 1) => v == null ? 'N/A' : `${Number(v).toFixed(d)}${u}`;

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const Reports = () => {
  const { sensorData, sensorHistory, farmHealthScore, systemHealth, fetchHistory } = useTelemetry();
  const { currentGPS, user, farmInfo } = useApp();

  const [genStep, setGenStep] = useState(0);
  const [busyMsg, setBusyMsg] = useState('');
  const [camSnap, setCamSnap] = useState(null);
  const [aiText, setAiText] = useState('');
  const [fbHistory, setFbHistory] = useState([]);
  const [error, setError] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [dateStr, setDateStr] = useState('');

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
  }, [pdfBlobUrl]);

  const defaultIP = '192.168.29.35';
  const { httpBase } = useMemo(() => {
    try { return visionBackendEndpoints(localStorage.getItem('agrisense_backend_ip') || defaultIP, defaultIP); }
    catch { return visionBackendEndpoints(defaultIP, defaultIP); }
  }, []);

  // Chart data from Firebase history
  const chartData = useMemo(() => {
    const src = fbHistory.length > 0 ? fbHistory : sensorHistory;
    if (!src.length) return [];
    const step = Math.max(1, Math.floor(src.length / 20));
    return src.filter((_, i) => i % step === 0).map((d, i) => ({
      label: i.toString(),
      moisture: d?.soil?.moisture != null ? +Number(d.soil.moisture).toFixed(1) : null,
      temp: d?.weather?.temp != null ? +Number(d.weather.temp).toFixed(1) : null,
      humidity: d?.weather?.humidity != null ? +Number(d.weather.humidity).toFixed(1) : null,
      level: d?.water?.level != null ? +Number(d.water.level).toFixed(1) : null,
    })).filter(d => Object.values(d).some(v => v !== null && v !== d.label));
  }, [fbHistory, sensorHistory]);

  const handleGenerate = useCallback(async () => {
    setError('');
    setGenStep(1);
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null); }
    const now = new Date();
    const ts = now.toLocaleString();
    const ds = now.toISOString().split('T')[0];
    setDateStr(ds);

    try {
      // Step 1: Firebase history
      setBusyMsg('Fetching Firebase telemetry...');
      const since = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      const history = await fetchHistory(since);
      setFbHistory(history || []);
      setGenStep(2);

      // Step 2: Camera snapshot — validate it's an actual image, not a 503 JSON error
      setBusyMsg('Acquiring field visual...');
      let imgB64 = null;
      try {
        const r = await fetch(`${httpBase}/frame/cam1?_cb=${Date.now()}`, { cache: 'no-store' });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('image')) {
          const blob = await r.blob();
          if (blob.size > 500) { // Must be at least 500 bytes to be a real image
            imgB64 = await new Promise(res => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.readAsDataURL(blob); });
          }
        }
      } catch (_) {}
      setCamSnap(imgB64);
      setGenStep(3);

      // Smart Fallback: If live telemetry is missing (offline node), use the latest historical snapshot
      const latestHistory = history?.length > 0 ? history[history.length - 1] : null;
      const effectiveSensors = {
        soil: (sensorData?.soil?.moisture != null) ? sensorData.soil : (latestHistory?.soil || {}),
        weather: (sensorData?.weather?.temp != null) ? sensorData.weather : (latestHistory?.weather || {}),
        water: (sensorData?.water?.level != null) ? sensorData.water : (latestHistory?.water || {}),
        storage: (sensorData?.storage?.temp != null) ? sensorData.storage : (latestHistory?.storage || {}),
      };

      // Step 3: AgriSense AI
      setBusyMsg('Running AgriSense AI analysis...');
      const ctx = {
        farmName: farmInfo?.name || 'AgriSense Farm',
        currentSensors: effectiveSensors, // Uses fallback
        weather: effectiveSensors.weather,
        health: { overall_score: farmHealthScore, systemHealth },
        recentLogs: (history || sensorHistory).slice(-5),
        time: now.toISOString()
      };
      const prompt = `You are a high-level Principal Agricultural Data Scientist and Certified Agronomist writing an official, concise Master Industrial Audit.

Your objective is to generate an authoritative, high-fidelity briefing. DO NOT output long paragraphs. Instead, output EXACTLY 6 distinct sections using a short heading followed by precise, numeric bullet points (e.g., "- High nitrate spike detected at 210ppm").

Format strictly as follows:
1. **Soil Analytics Summary** (3 bullets on NPK/pH)
2. **Atmospheric Brief** (2 bullets on heat/humidity stress)
3. **Irrigation Check** (2 bullets on water level/flow)
4. **Physiological Health Verdict** (1 dense summary sentence)
5. **Corrective Actions** (Top 2 mandatory immediate fixes)
6. **Strategic Roadmap** (Top 2 operational targets for next 7 days)

Be remarkably concise but intense with technical numerical precision. No generic sentences.`;
      const ai = await askGemini(prompt, ctx);
      setAiText(ai || 'Automated analysis complete.');
      setGenStep(4);

      // Step 4: Build PDF (no auto-download)
      setBusyMsg('Rendering PDF preview...');
      const blobUrl = await buildAuditPDF({
        sensorData: effectiveSensors, // Uses fallback to avoid N/A
        firebaseHistory: history || [], aiText: ai || '',
        camImageB64: imgB64, gps: currentGPS, user, farmInfo,
        farmHealthScore, systemHealth, timestamp: ts
      });
      setPdfBlobUrl(blobUrl);
      setGenStep(5);

    } catch (e) {
      console.error(e);
      setError(e.message || 'Generation failed');
      setGenStep(0);
    }
  }, [sensorData, sensorHistory, farmHealthScore, systemHealth, fetchHistory, currentGPS, user, farmInfo, httpBase, pdfBlobUrl]);

  const handleDownload = useCallback(() => {
    if (pdfBlobUrl) downloadAuditPDF(pdfBlobUrl, dateStr);
  }, [pdfBlobUrl, dateStr]);

  const handleReset = useCallback(() => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setCamSnap(null);
    setAiText('');
    setFbHistory([]);
    setGenStep(0);
  }, [pdfBlobUrl]);

  const step = genStep; // alias for JSX below

  const steps = [
    { label: 'Firebase Data', icon: Database },
    { label: 'Field Scan', icon: Camera },
    { label: 'AI Analysis', icon: Sparkles },
    { label: 'PDF Export', icon: Download },
  ];

  return (
    <div className="no-scrollbar" style={{ background: 'var(--bg-main)', minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'Outfit', sans-serif", overflowY: 'auto', paddingBottom: 100 }}>

      {/* HEADER */}
      <div style={{ padding: '1.25rem 1rem 0.75rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--glass-stroke)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 950, color: 'var(--text-main)' }}>Audit Vault</h1>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>AI-Powered Field Audit Reports</div>
          </div>
          {step === 0 && (
            <motion.button whileTap={{ scale: 0.94 }} onClick={handleGenerate}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 18px', fontSize: '0.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 6px 20px var(--primary-soft)' }}>
              <Sparkles size={15} /> GENERATE AUDIT
            </motion.button>
          )}
          {step === 5 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button whileTap={{ scale: 0.94 }} onClick={handleReset}
                style={{ background: 'var(--bg-sheet)', border: '1px solid var(--glass-stroke)', color: 'var(--text-main)', borderRadius: 12, padding: '8px 14px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>
                RESET
              </motion.button>
              <motion.button whileTap={{ scale: 0.94 }} onClick={handleDownload}
                style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 16px', fontSize: '0.7rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 4px 14px var(--primary-soft)' }}>
                <Download size={14} /> EXPORT PDF
              </motion.button>
            </div>
          )}
        </div>

        {/* Step indicators */}
        {(step > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 8 }}>
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <Step label={s.label} icon={s.icon} done={step > i + 1} active={step === i + 1} />
                {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, background: step > i + 1 ? 'var(--primary)' : 'var(--border-main)', transition: 'all 0.4s', marginBottom: 14 }} />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, padding: '1rem' }}>
        <AnimatePresence mode="wait">

          {/* IDLE */}
          {step === 0 && (
            <motion.div key="idle" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {error && (
                <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 16, padding: '0.75rem 1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AlertTriangle size={16} color="var(--danger)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger)' }}>{error}</span>
                </div>
              )}

              {/* Info banner */}
              <div style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 20, padding: '1rem', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <FileText size={22} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: 4 }}>What gets included in your audit</div>
                  {['7-day Firebase telemetry history', 'Live camera field snapshot with timestamp', 'AgriSense AI professional agronomist analysis', 'Soil, Weather, Irrigation & Storage breakdown', 'Trend sparkline charts per sensor', 'Recommendations & certification page'].map(t => (
                    <div key={t} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <ChevronRight size={12} color="var(--primary)" />{t}
                    </div>
                  ))}
                </div>
              </div>

              {/* Live snapshot grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <StatCard label="Soil Moisture" value={sv(sensorData?.soil?.moisture, '%', 0)} icon={Sprout} color="var(--primary)" sub={sensorData?.soil?.moisture >= 30 ? 'Optimal' : 'Low'} />
                <StatCard label="Air Temp" value={sv(sensorData?.weather?.temp, '°C')} icon={CloudSun} color="var(--accent)" />
                <StatCard label="Tank Level" value={sv(sensorData?.water?.level, '%', 0)} icon={Droplets} color="var(--secondary)" />
                <StatCard label="Farm Health" value={`${Math.round(farmHealthScore || 0)}%`} icon={Activity} color={farmHealthScore >= 70 ? 'var(--primary)' : 'var(--danger)'} />
              </div>

              {/* Meta cards */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-stroke)', borderRadius: 20, padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  { icon: MapPin, label: 'Field', val: currentGPS?.city || 'Locating...' },
                  { icon: User, label: 'Operator', val: user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Field Op' },
                  { icon: Sprout, label: 'Crop', val: farmInfo?.projectName || farmInfo?.name || 'Mixed Crop' },
                  { icon: Database, label: 'History', val: `${sensorHistory.length} records` },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={14} color="var(--text-muted)" />
                    <div>
                      <div style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: 'var(--text-main)' }}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts preview */}
              {chartData.length > 0 && (
                <>
                  <MiniChart data={chartData} dataKey="moisture" color="#10B981" label="Soil Moisture History (%)" />
                  <MiniChart data={chartData} dataKey="temp" color="#F59E0B" label="Temperature History (°C)" />
                </>
              )}
            </motion.div>
          )}

          {/* GENERATING */}
          {step > 0 && step < 5 && (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, paddingTop: '4rem' }}>
              <motion.div
                animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                style={{ width: 56, height: 56, border: '4px solid var(--border-main)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-main)' }}>{busyMsg}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Step {step} of 4</div>
              </div>

              {/* Show camera preview if captured */}
              {camSnap && (
                <div style={{ width: '100%', maxWidth: 300, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--glass-stroke)' }}>
                  <img src={camSnap} alt="Field" style={{ width: '100%', display: 'block' }} />
                  <div style={{ background: 'var(--bg-dark)', padding: '6px 12px', fontSize: '0.6rem', fontWeight: 900, color: 'rgba(255,255,255,0.7)' }}>
                    📷 Field snapshot acquired
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* DONE — Show PDF Preview on screen, EXPORT button to download */}
          {step === 5 && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Success banner */}
              <div style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 20, padding: '1rem', display: 'flex', gap: 12, alignItems: 'center' }}>
                <CheckCircle size={26} color="var(--primary)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-main)' }}>Audit Report Ready!</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>Tap EXPORT PDF above to download to your device</div>
                </div>
              </div>

              {/* PDF File Card — replaces iframe (blob URLs don't render in Android WebView) */}
              {pdfBlobUrl && (
                <div style={{ borderRadius: 24, overflow: 'hidden', border: '2px solid var(--primary)', background: 'var(--bg-card)', boxShadow: '0 8px 30px rgba(16,185,129,0.12)' }}>
                  {/* File header */}
                  <div style={{ background: 'linear-gradient(135deg, #065F46, #10B981)', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 54, height: 66, background: 'rgba(255,255,255,0.15)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }}>
                      <FileText size={24} color="white" />
                      <span style={{ fontSize: '0.45rem', fontWeight: 900, color: 'white', marginTop: 4 }}>PDF</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>AgriSense_Audit_{dateStr}.pdf</div>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', fontWeight: 700, marginTop: 4 }}>AI-Powered Field Audit Report • 7 Pages A4</div>
                      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginTop: 2 }}>Generated {new Date().toLocaleTimeString()}</div>
                    </div>
                  </div>
                  {/* Contents summary */}
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { icon: '📊', label: 'Sensor Analytics', desc: 'Soil, Weather, Irrigation & Storage data' },
                      { icon: '🤖', label: 'AI Advisory', desc: 'Gemini-powered agronomist recommendations' },
                      { icon: '📸', label: 'Field Visual', desc: camSnap ? 'Live camera snapshot embedded' : 'Camera offline — skipped' },
                      { icon: '📈', label: 'Trend Charts', desc: '7-day Firebase telemetry history' },
                    ].map(({ icon, label, desc }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--glass-stroke)' }}>
                        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-main)' }}>{label}</div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>{desc}</div>
                        </div>
                      </div>
                    ))}
                    <motion.button
                      whileTap={{ scale: 0.96 }} onClick={handleDownload}
                      style={{ marginTop: 8, width: '100%', height: 52, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 16, fontSize: '0.85rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}
                    >
                      <Download size={18} /> DOWNLOAD NOW
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Meta info strip */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-stroke)', borderRadius: 20, padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  ['Firebase Records', `${fbHistory.length} entries`],
                  ['AI Engine', 'Gemini / Groq'],
                  ['Pages', '5 pages A4'],
                  ['Camera', camSnap ? 'Captured' : 'Offline'],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{l}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-main)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Reports;
