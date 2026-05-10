/**
 * AgriSense Vision Node v2.0 — "Ultra-Premium" UX Integration
 * - Streams from YOLO Python backend (not direct ESP-CAM)
 * - Premium HUD & Responsive Visual Design matched from Git 
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  EyeOff, Bell, Lightbulb, Camera as CaptureIcon,
  Wifi, WifiOff, AlertTriangle, ShieldAlert, CheckCircle, List, Video, Settings, RefreshCw,
  Expand, Minimize2, Target, Maximize2
} from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useTelemetry } from '../../state/TelemetryContext';
import { visionBackendEndpoints, normalizeBackendInputForStorage } from '../../utils/visionBackendUrl';
import { ScreenOrientation } from '@capacitor/screen-orientation';

const BACKEND_PORT = '5050';
const CAM_IDS = ['cam1'];
const MIN_ALERT_CONF_PCT = 30;

const strongestAlertDetection = (detections) => {
  if (!detections?.length) return null;
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  return sorted.find((d) => d.confidence >= MIN_ALERT_CONF_PCT) || null;
};

function isNativeCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

const NATIVE_JPEG_POLL_MS = 250;

const C = {
  primary: '#10B981', danger: '#EF4444', warning: '#F59E0B',
  secondary: '#3B82F6', text: 'var(--text-main)', muted: 'var(--text-muted)',
  border: 'var(--border-main)', bg: 'var(--bg-main)', card: 'var(--bg-card)',
};

// ── DESIGN TOKENS & COMPONENTS FROM PREMIUM UI ───────────────────────────────
const LAYOUT = {
  cornerOffset: 20,
  contentOffset: 30,
  bracketSize: 45
};

const LiveClock = ({ compact = false }) => {
  const [time, setTime] = useState(new Date());
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const it = setInterval(() => {
      setTime(new Date());
      setBlink(prev => !prev);
    }, 1000);
    return () => clearInterval(it);
  }, []);

  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontFamily: 'monospace' }}>
        <span style={{ fontSize: compact ? '1rem' : '1.5rem', fontWeight: 950, color: 'white', letterSpacing: '0.05em', textShadow: '0 0 8px rgba(0,0,0,0.6)' }}>{h}</span>
        <span style={{ fontSize: compact ? '0.9rem' : '1.3rem', fontWeight: 950, color: C.primary, opacity: blink ? 1 : 0.3 }}>:</span>
        <span style={{ fontSize: compact ? '1rem' : '1.5rem', fontWeight: 950, color: 'white', letterSpacing: '0.05em', textShadow: '0 0 8px rgba(0,0,0,0.6)' }}>{m}</span>
      </div>
      <span style={{ fontSize: '0.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em' }}>
        {time.toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()}
      </span>
    </div>
  );
};

const TacticalFrame = ({ color = '#10B981' }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
    <div style={{ position: 'absolute', top: LAYOUT.cornerOffset, left: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderTop: `3px solid ${color}`, borderLeft: `3px solid ${color}`, opacity: 0.7 }} />
    <div style={{ position: 'absolute', top: LAYOUT.cornerOffset, right: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderTop: `3px solid ${color}`, borderRight: `3px solid ${color}`, opacity: 0.7 }} />
    <div style={{ position: 'absolute', bottom: LAYOUT.cornerOffset, left: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderBottom: `3px solid ${color}`, borderLeft: `3px solid ${color}`, opacity: 0.7 }} />
    <div style={{ position: 'absolute', bottom: LAYOUT.cornerOffset, right: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderBottom: `3px solid ${color}`, borderRight: `3px solid ${color}`, opacity: 0.7 }} />
    <motion.div
      animate={{ top: ['0%', '100%', '0%'] }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      style={{ position: 'absolute', left: 0, right: 0, height: '1px', background: color, opacity: 0.1, boxShadow: `0 0 10px ${color}` }}
    />
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent 40%, rgba(15, 23, 42, 0.4) 100%)', opacity: 0.5 }} />
  </div>
);

const ControlButton = ({ icon: Icon, label, active, onClick, color = C.primary }) => (
  <motion.div
    whileTap={{ scale: 0.94 }}
    onClick={onClick}
    style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--glass-stroke)',
      borderRadius: '24px', padding: '1.2rem 0.5rem', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
    }}
  >
    <div style={{
      width: '44px', height: '44px', borderRadius: '16px',
      background: active ? `${color}15` : 'var(--bg-main)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <Icon size={22} color={color} strokeWidth={2.5} />
    </div>
    <span style={{ fontSize: '0.6rem', fontWeight: 950, color: C.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </span>
  </motion.div>
);

// ── Dot badge ───────────────────────────────────────────────────────────────
const Dot = ({ color, pulse }) => (
  <motion.div
    animate={pulse ? { opacity: [1, 0.3, 1] } : {}}
    transition={{ duration: 1.5, repeat: Infinity }}
    style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }}
  />
);

// ── Tab button ───────────────────────────────────────────────────────────────
const Tab = ({ label, icon: Icon, active, badge, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.95 }} onClick={onClick}
    style={{
      flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
      background: active ? C.card : 'transparent',
      borderRadius: 14, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 4,
      boxShadow: active ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
      position: 'relative',
    }}
  >
    <Icon size={16} color={active ? C.secondary : C.muted} strokeWidth={2.5} />
    <span style={{ fontSize: '0.55rem', fontWeight: 900, color: active ? C.secondary : C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    {badge > 0 && (
      <div style={{ position: 'absolute', top: 6, right: 10, background: C.danger, color: 'white', fontSize: '0.5rem', fontWeight: 900, padding: '1px 5px', borderRadius: 8 }}>
        {badge > 9 ? '9+' : badge}
      </div>
    )}
  </motion.button>
);

// ── Main component ───────────────────────────────────────────────────────────
const VisualMonitor = () => {
  const { toggleActuator } = useApp();
  const { sensorData } = useTelemetry();

  const defaultIP = '192.168.29.35';
  const [backendIp, setBackendIp] = useState(() => {
    try {
      const saved = localStorage.getItem('agrisense_backend_ip')?.trim();
      if (!saved) return defaultIP;
      const n = normalizeBackendInputForStorage(saved);
      return n || defaultIP;
    } catch {
      return defaultIP;
    }
  });

  const { httpBase: backendBase, wsUrl: backendWs } = useMemo(
    () => visionBackendEndpoints(backendIp, defaultIP),
    [backendIp]
  );

  const [activeCam, setActiveCam] = useState(CAM_IDS[0]);
  const nativeStream = isNativeCapacitor();
  const mjpegUrl = useMemo(
    () => `${backendBase}/stream/${encodeURIComponent(activeCam)}?_cb=${Date.now()}`,
    [backendBase, activeCam]
  );
  const [streamOnline, setStreamOnline] = useState(false);
  const [streamHint, setStreamHint] = useState('');
  const [jpegFrameUrl, setJpegFrameUrl] = useState(null);
  const jpegPollBlobRef = useRef(null);

  useEffect(() => {
    setStreamOnline(false);
    setStreamHint('Connecting…');
    if (nativeStream) {
      setJpegFrameUrl(null);
      if (jpegPollBlobRef.current) {
        URL.revokeObjectURL(jpegPollBlobRef.current);
        jpegPollBlobRef.current = null;
      }
    }
  }, [backendBase, activeCam, nativeStream]);

  useEffect(() => {
    if (!nativeStream) return undefined;
    let cancelled = false;
    let isFetching = false;

    const revokeBlob = () => {
      if (jpegPollBlobRef.current) {
        URL.revokeObjectURL(jpegPollBlobRef.current);
        jpegPollBlobRef.current = null;
      }
    };

    const makeOpts = () => {
      const o = { cache: 'no-store', credentials: 'omit' };
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        o.signal = AbortSignal.timeout(10000);
      }
      return o;
    };

    let failCount = 0;
    const pullOnce = async () => {
      if (isFetching || cancelled) return;
      isFetching = true;
      
      const cam = encodeURIComponent(activeCam);
      const paths = [`/frame/${cam}`, '/frame', `/snapshot/${cam}`, '/snapshot'];
      try {
        let lastStatus = 0;
        let res = null;
        for (const p of paths) {
          const url = `${backendBase}${p}?_cb=${Date.now()}`;
          const r = await fetch(url, makeOpts());
          lastStatus = r.status;
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          if (r.ok && ct.includes('image')) {
            res = r;
            break;
          }
        }
        if (!res || cancelled) {
          if (!cancelled) {
            failCount++;
            if (failCount > 3) {
              let extra = '';
              if (lastStatus === 404) {
                try {
                  const hr = await fetch(`${backendBase}/health`, { cache: 'no-store', credentials: 'omit' });
                  if (hr.ok) {
                    const j = await hr.json();
                    extra = (j.api_version >= 2)
                      ? ' (check port 5050 / backend restart)'
                      : ' (update agrisense_vision_backend.py on PC)';
                  }
                } catch (_) { /* ignore */ }
              }
              setStreamHint(lastStatus ? `HTTP ${lastStatus}${extra}` : 'No JPEG from backend');
              setStreamOnline(false);
            }
          }
          isFetching = false;
          return;
        }
        const blob = await res.blob();
        if (cancelled || !blob || blob.size < 32) {
            isFetching = false;
            return;
        }
        revokeBlob();
        const objUrl = URL.createObjectURL(blob);
        jpegPollBlobRef.current = objUrl;
        setJpegFrameUrl(objUrl);
        if (!cancelled) {
          failCount = 0;
          setStreamOnline(true);
          setStreamHint('');
        }
      } catch (e) {
        if (!cancelled) {
          failCount++;
          if (failCount > 3) {
            setStreamOnline(false);
            setStreamHint(e?.name === 'AbortError' ? 'Timeout — backend running?' : (e?.message || 'Fetch failed'));
          }
        }
      }
      isFetching = false;
    };

    pullOnce();
    const id = setInterval(pullOnce, 750);
    return () => {
      cancelled = true;
      clearInterval(id);
      revokeBlob();
    };
  }, [backendBase, activeCam, nativeStream]);

  const [tab, setTab] = useState('stream');
  const [buzzerOn, setBuzzerOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [liveDetect, setLiveDetect] = useState(null);
  const [unread, setUnread] = useState(0);
  const [backendOk, setBackendOk] = useState(false);
  const [capturedImg, setCapturedImg] = useState(null);
  const [captureObjUrl, setCaptureObjUrl] = useState(null);
  const [captureSaved, setCaptureSaved] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Fullscreen logic synced with native screen orientation
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullScreen = async () => {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
      setIsFullscreen(true);
    } catch (e) {
      setIsFullscreen(true);
    }
  };

  const exitFullScreen = async () => {
    try {
      await ScreenOrientation.unlock();
      setIsFullscreen(false);
    } catch (e) {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    if (isFullscreen) document.body.classList.add('hide-bot');
    else document.body.classList.remove('hide-bot');
    return () => document.body.classList.remove('hide-bot');
  }, [isFullscreen]);

  const wsRef = useRef(null);
  const autoOffTimer = useRef(null);
  const alertsEndRef = useRef(null);
  const destroyedRef = useRef(false);
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // WebSocket connection
  const connectWS = useCallback(() => {
    if (destroyedRef.current) return;
    if (wsRef.current) { try { wsRef.current.close(); } catch (_) { } }
    let ws;
    try { ws = new WebSocket(backendWs); } catch (_) { return; }
    ws.onopen = () => {
      if (!destroyedRef.current) {
        setBackendOk(true);
      }
    };
    ws.onmessage = (e) => {
      if (destroyedRef.current) return;
      try {
        const data = JSON.parse(e.data);
        const { cam_id, detections, timestamp } = data;
        const top = strongestAlertDetection(detections);
        if (top) {
          setLiveDetect({ id: timestamp, label: top.label, confidence: top.confidence, cam_id });
          const entry = {
            id: timestamp,
            animal: top.label,
            cam: cam_id,
            confidence: top.confidence,
            time: new Date(timestamp).toLocaleTimeString(),
            allDetections: detections.filter((d) => d.confidence >= MIN_ALERT_CONF_PCT).map((d) => d.label).join(', '),
          };
          setAlerts(prev => [entry, ...prev].slice(0, 50));
          setUnread(prev => tabRef.current !== 'alerts' ? prev + 1 : 0);
          setBuzzerOn(true);
          setFlashOn(true);
          clearTimeout(autoOffTimer.current);
          autoOffTimer.current = setTimeout(() => {
            setBuzzerOn(false);
            setFlashOn(false);
            setLiveDetect(null);
          }, 5000);
        } else {
          setLiveDetect(null);
        }
      } catch (_) { }
    };
    ws.onerror = () => { if (!destroyedRef.current) setBackendOk(false); };
    ws.onclose = () => {
      if (destroyedRef.current) return;
      setBackendOk(false);
      setTimeout(connectWS, 5000);
    };
    wsRef.current = ws;
  }, [backendWs]);

  useEffect(() => {
    destroyedRef.current = false;
    connectWS();
    return () => {
      destroyedRef.current = true;
      try { wsRef.current?.close(); } catch (_) { }
      clearTimeout(autoOffTimer.current);
    };
  }, [connectWS]);

  // Fetch current detection endpoint
  useEffect(() => {
    let timer;
    const fetchDetections = async () => {
      try {
        const res = await fetch(`${backendBase}/detections`);
        if (res.ok) {
          setBackendOk(true);
          const data = await res.json();
          const camData = data[activeCam] || {};
          const detections = camData.detections || [];
          const isCamOnline = camData.online === true;

          // We can force stream offline too if the API itself says the hardware died
          if (!isCamOnline) setStreamOnline(false);

          const top = strongestAlertDetection(detections);
          if (top) {
            setLiveDetect({ id: Date.now(), label: top.label, confidence: top.confidence, cam_id: activeCam });
            setBuzzerOn(true);
            setFlashOn(true);
            clearTimeout(autoOffTimer.current);
            autoOffTimer.current = setTimeout(() => {
              setBuzzerOn(false);
              setFlashOn(false);
              setLiveDetect(null);
            }, 5000);
          } else {
            setLiveDetect(null);
          }
        }
      } catch (_) { }
      timer = setTimeout(fetchDetections, 2000);
    };
    fetchDetections();
    return () => clearTimeout(timer);
  }, [backendBase, activeCam]);

  const [sensorAlert, setSensorAlert] = useState(null);
  useEffect(() => {
    let active = true;
    const pollAlerts = async () => {
      try {
        const res = await fetch('http://192.168.29.200/status');
        if (res.ok) {
          const data = await res.json();
          if (data.alert && active) setSensorAlert(data.alert);
          else if (active) setSensorAlert(null);
        }
      } catch (_) { if (active) setSensorAlert(null); }
    };
    pollAlerts();
    const interval = setInterval(pollAlerts, 4000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const handleBuzzer = useCallback(async () => {
    const next = !buzzerOn;
    setBuzzerOn(next);
    try { await fetch(`${backendBase}/buzzer?state=${next ? 'on' : 'off'}`); } catch (_) { }
  }, [buzzerOn, backendBase]);

  const handleFlash = useCallback(async () => {
    const next = !flashOn;
    setFlashOn(next);
    try { await fetch(`${backendBase}/light?state=${next ? 'on' : 'off'}`); } catch (_) { }
  }, [flashOn, backendBase]);

  const captureImage = useCallback(async () => {
    setIsCapturing(true);
    setCaptureSaved(false);
    setCaptureError(false);
    try {
      const res = await fetch(`http://192.168.29.201/capture?_cb=${Date.now()}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const fileName = `AgriSense_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;

      if (captureObjUrl) URL.revokeObjectURL(captureObjUrl);
      const objUrl = URL.createObjectURL(blob);
      setCaptureObjUrl(objUrl);
      setCapturedImg(objUrl);

      if (window.Capacitor?.isNativePlatform()) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const { Media } = await import('@capacitor-community/media');
            const fsRes = await Filesystem.writeFile({
              path: fileName, data: reader.result.split(',')[1], directory: Directory.Data
            });
            try { await Media.savePhoto({ path: fsRes.uri }); } catch {
              await Filesystem.writeFile({
                path: `AgriSense/${fileName}`, data: reader.result.split(',')[1], directory: Directory.Documents, recursive: true
              });
            }
            setCaptureSaved(true);
          } catch { setCaptureSaved(true); }
        };
        reader.readAsDataURL(blob);
      } else {
        const a = document.createElement('a');
        a.href = objUrl; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setCaptureSaved(true);
      }
    } catch {
      setCaptureError(true);
    } finally {
      setTimeout(() => setIsCapturing(false), 1200);
    }
  }, [captureObjUrl]);

  const switchTab = (t) => {
    setTab(t);
    if (t === 'alerts') setUnread(0);
  };

  return (
    <div className="no-scrollbar" style={{
      background: 'var(--bg-main)', minHeight: '100%',
      display: 'flex', flexDirection: 'column',
      padding: isFullscreen ? 0 : '1rem',
      paddingBottom: isFullscreen ? 0 : '100px',
      fontFamily: "'Outfit', sans-serif",
      color: 'var(--text-main)',
      gap: '1.25rem'
    }}>

      <AnimatePresence>
        {liveDetect && (
          <motion.div
            key={liveDetect.id}
            initial={{ y: -70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -70, opacity: 0 }}
            style={{
              position: 'fixed', top: 16, left: 16, right: 16, zIndex: 11000,
              background: C.danger, borderRadius: 18, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 10px 40px rgba(239,68,68,0.45)',
            }}
          >
            <AlertTriangle size={22} color="white" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🐾 {liveDetect.label} detected!
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                Cam: {liveDetect.cam_id}  •  {liveDetect.confidence}% conf
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CAMERA SCREEN CONTAINER ── */}
      <div style={isFullscreen ? {
        position: 'fixed', inset: 0, zIndex: 10000, background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center'
      } : {
        position: 'relative', background: '#0F172A', borderRadius: '32px',
        aspectRatio: '16/10', width: '100%', overflow: 'hidden',
        boxShadow: '0 12px 35px rgba(15, 23, 42, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{
          height: isFullscreen ? '100vh' : '100%',
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {nativeStream ? (
            jpegFrameUrl ? (
              <img
                src={jpegFrameUrl}
                alt="YOLO" decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: streamOnline ? 1 : 0, position: 'absolute', inset: 0 }}
              />
            ) : null
          ) : (
            <img
              src={mjpegUrl} alt="YOLO" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: backendOk ? 1 : 0, position: 'absolute', inset: 0, transition: 'opacity 0.3s' }}
            />
          )}

          {(nativeStream ? !streamOnline : !backendOk) && (
            <div style={{ textAlign: 'center', color: '#475569', zIndex: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <EyeOff size={48} strokeWidth={1} />
              <div style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '0.1em' }}>NO SIGNAL</div>
              {streamHint && nativeStream && <div style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.7 }}>{streamHint}</div>}
              {!nativeStream && !backendOk && <div style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.7 }}>Check Backend Terminal</div>}
            </div>
          )}

          {/* Detection bounding box overlay */}
          {liveDetect && streamOnline && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ position: 'absolute', left: '30%', top: '30%', width: '40%', height: '40%', border: `3px solid ${C.danger}`, borderRadius: 8, zIndex: 15, boxShadow: `0 0 30px ${C.danger}60` }}
            >
              <div style={{ position: 'absolute', top: -24, left: 0, background: C.danger, color: 'white', fontSize: '0.55rem', fontWeight: 950, padding: '3px 8px', borderRadius: 6 }}>
                {liveDetect.label.toUpperCase()} {liveDetect.confidence}%
              </div>
            </motion.div>
          )}

          {/* PREMIUM UI OVERLAYS */}
          <TacticalFrame color={C.primary} />

          {/* HUD Contents */}
          <div style={{ position: 'absolute', inset: 0, padding: LAYOUT.contentOffset, zIndex: 20, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <LiveClock compact={!isFullscreen} />

              {/* LIVE / Status Badge */}
              <div style={{ pointerEvents: 'auto', display: 'flex', gap: 6 }}>
                <div style={{ background: (nativeStream ? streamOnline : backendOk) ? `${C.danger}99` : '#475569AA', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Dot color="white" pulse={(nativeStream ? streamOnline : backendOk)} />
                  <span style={{ fontSize: '0.55rem', fontWeight: 950, color: 'white', letterSpacing: '0.1em' }}>{(nativeStream ? streamOnline : backendOk) ? 'LIVE' : 'OFFLINE'}</span>
                </div>
                <div style={{ background: backendOk ? `${C.primary}99` : '#EF444499', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {backendOk ? <Wifi size={10} color="white" /> : <WifiOff size={10} color="white" />}
                  <span style={{ fontSize: '0.55rem', fontWeight: 950, color: 'white', letterSpacing: '0.08em' }}>
                    {backendOk ? 'AI OK' : 'NO AI'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              {/* Fullscreen Toggler (Bottom Right) */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={isFullscreen ? exitFullScreen : enterFullScreen}
                style={{
                  pointerEvents: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.8)', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))'
                }}
              >
                {isFullscreen ? <Minimize2 size={32} /> : <Expand size={30} />}
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {!isFullscreen && (
        <React.Fragment>
          {/* ── TACTICAL CONSOLE CARD ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--bg-card)', borderRadius: '28px', padding: '1.5rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.03)', border: '1px solid var(--glass-stroke)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '4px', height: '18px', background: '#10B981', borderRadius: '10px' }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>Tactical Console</h3>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <ControlButton icon={Bell} label="Buzzer" active={buzzerOn} onClick={handleBuzzer} color={C.danger} />
              <ControlButton icon={Lightbulb} label="Floodlight" active={flashOn} onClick={handleFlash} color="#F59E0B" />
              <ControlButton icon={CaptureIcon} label="Snapshot" active={isCapturing} onClick={captureImage} color="#10B981" />
            </div>
          </motion.div>



          {/* ── TABS SYSTEM (Preserved Utilities) ── */}
          <div style={{ background: 'var(--bg-sheet)', borderRadius: 20, padding: 4, display: 'flex', gap: 2 }}>
            <Tab label="Stream" icon={Video} active={tab === 'stream'} onClick={() => switchTab('stream')} />
            <Tab label="Alerts" icon={List} active={tab === 'alerts'} badge={unread} onClick={() => switchTab('alerts')} />
            <Tab label="Config" icon={Settings} active={tab === 'config'} onClick={() => switchTab('config')} />
          </div>

          {/* Tab Contcdent Area */}
          <div style={{ padding: '0 4px 40px' }}>
            {tab === 'stream' && (
              <div style={{ background: backendOk ? '#ECFDF5' : '#FEF2F2', borderRadius: 24, padding: '1rem', border: `1px solid ${backendOk ? '#10B9811A' : '#EF44441A'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={22} color={backendOk ? C.primary : C.danger} />
                <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: backendOk ? C.primary : C.danger, textTransform: 'uppercase' }}>
                    {backendOk ? "AI Engine Ready" : "No AI Link"}
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted }}>
                    {backendOk ? 'Real-time object tracking active' : 'Connect vision backend on PC'}
                  </div>
                </div>
              </div>
            )}

            {tab === 'alerts' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 900, color: C.text }}>Detection Log</span>
                  {alerts.length > 0 && (
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => setAlerts([])}
                      style={{ background: 'var(--bg-sheet)', border: 'none', borderRadius: 10, padding: '4px 12px', fontSize: '0.6rem', fontWeight: 900, color: C.muted }}>
                      CLEAR
                    </motion.button>
                  )}
                </div>
                {alerts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: C.muted, fontSize: '0.7rem', fontWeight: 700 }}>
                    No logged detections yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {alerts.map((a) => (
                      <div key={a.id} style={{ background: 'var(--bg-card)', borderRadius: '18px', padding: '12px 14px', border: '1px solid var(--glass-stroke)', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 15px rgba(0,0,0,0.01)' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 12, background: `${C.danger}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AlertTriangle size={16} color={C.danger} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 900, color: C.text }}>🐾 {a.animal}</div>
                          <div style={{ fontSize: '0.6rem', color: C.muted, fontWeight: 700 }}>Cam: {a.cam} • {a.confidence}% conf</div>
                        </div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: C.muted }}>{a.time}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'config' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--bg-card)', borderRadius: 18, padding: '1rem', border: '1px solid var(--glass-stroke)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: 8 }}>PC Backend Address</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
                    Enter your PC's LAN IP where <strong>agrisense_vision_backend.py</strong> is running. Must be on same Wi-Fi.
                  </div>
                  <input
                    type="text" value={backendIp}
                    onChange={(e) => setBackendIp(e.target.value)}
                    onBlur={() => {
                      const n = normalizeBackendInputForStorage(backendIp);
                      setBackendIp(n || defaultIP);
                      localStorage.setItem('agrisense_backend_ip', n || defaultIP);
                    }}
                    placeholder="e.g. 192.168.29.35"
                    style={{ background: 'var(--bg-main)', padding: '14px', borderRadius: 14, border: '1px solid var(--border-main)', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 700, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={async () => {
                      try {
                        const n = normalizeBackendInputForStorage(backendIp) || defaultIP;
                        localStorage.setItem('agrisense_backend_ip', n);
                        setBackendIp(n);
                        const r = await fetch(`http://${n}:5050/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
                        if (r.ok) alert('✅ Backend connected! Camera stream will start shortly.');
                        else alert('❌ Backend reachable but returned error: ' + r.status);
                      } catch (e) {
                        alert('❌ Cannot reach backend. Check:\n1. Python script is running on PC\n2. Both devices on same Wi-Fi\n3. IP address is correct');
                      }
                    }}
                    style={{ marginTop: 10, width: '100%', height: 46, background: backendOk ? 'var(--primary)' : '#3B82F6', color: 'white', border: 'none', borderRadius: 14, fontSize: '0.8rem', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {backendOk ? <CheckCircle size={16} /> : <RefreshCw size={16} />}
                    {backendOk ? 'Connected ✓ — Re-test' : 'TEST CONNECTION'}
                  </motion.button>
                </div>

                <div style={{ background: '#FEF3C7', borderRadius: 18, padding: '1rem', border: '1px solid #F59E0B33' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#92400E', marginBottom: 6 }}>⚡ Quick Setup</div>
                  {['1. On PC: run python agrisense_vision_backend.py', '2. Note the IP shown in terminal (e.g. 192.168.29.35)', '3. Enter that IP above and tap TEST CONNECTION', '4. Go to Stream tab — camera will appear automatically'].map(s => (
                    <div key={s} style={{ fontSize: '0.62rem', color: '#78350F', fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>{s}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </React.Fragment>
      )}

      {/* Captured Image Overlay */}
      <AnimatePresence>
        {capturedImg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setCapturedImg(null); setCaptureSaved(false); setCaptureError(false); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.9)', zIndex: 12000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}
          >
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} src={capturedImg} style={{ width: '100%', maxWidth: 450, borderRadius: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }} />
            {captureSaved && (
              <div style={{ marginTop: '20px', background: 'rgba(16,185,129,0.2)', padding: '8px 20px', borderRadius: '30px', color: '#10B981', fontSize: '0.7rem', fontWeight: 900 }}>
                SNAPSHOT SAVED TO VAULT
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};

export default VisualMonitor;
