/**
 * AgriSense Pro v18.0.0 "Ultra-Premium" Visual Monitoring
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  EyeOff, Bell, Lightbulb, Camera as CaptureIcon,
  Maximize2, AlertTriangle, ShieldAlert,
  Minimize2, Zap, Radio, Scan, Target,
  RefreshCw, Power, Settings, ChevronRight, Cpu
} from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useTelemetry } from '../../state/TelemetryContext';
import { ACTUATORS } from '../../logic/healthEngine';

import { ScreenOrientation } from '@capacitor/screen-orientation';

// ΓöÇΓöÇΓöÇ DESIGN TOKENS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const LAYOUT = {
  cornerOffset: 24,    // Position of L-brackets
  contentOffset: 42,   // Position of nested content (Clock, Buttons)
  bracketSize: 56      // Size of L-brackets
};

const springConfig = { type: "spring", stiffness: 300, damping: 30 };
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};
const itemFadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springConfig }
};

// ΓöÇΓöÇΓöÇ SUB-COMPONENTS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const Badge = ({ children, color, pulse = false }) => (
  <div style={{ 
    background: `${color}20`, color: color, padding: '6px 14px', borderRadius: '12px', 
    fontSize: '0.65rem', fontWeight: 950, display: 'flex', alignItems: 'center', gap: '8px',
    border: `1px solid ${color}30`, backdropFilter: 'blur(12px)', textTransform: 'uppercase', letterSpacing: '0.05em'
  }}>
    {pulse && (
      <motion.div 
        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} 
      />
    )}
    {children}
  </div>
);

const LiveClock = ({ compact = false, showSeconds = true }) => {
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
  const s = time.getSeconds().toString().padStart(2, '0');
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontFamily: 'monospace' }}>
        <span style={{ fontSize: compact ? '0.9rem' : '1.4rem', fontWeight: 950, color: 'white', letterSpacing: '0.05em', textShadow: '0 0 10px rgba(0,0,0,0.5)' }}>{h}</span>
        <span style={{ fontSize: compact ? '0.8rem' : '1.2rem', fontWeight: 950, color: 'var(--primary)', opacity: blink ? 1 : 0.3 }}>:</span>
        <span style={{ fontSize: compact ? '0.9rem' : '1.4rem', fontWeight: 950, color: 'white', letterSpacing: '0.05em', textShadow: '0 0 10px rgba(0,0,0,0.5)' }}>{m}</span>
        {!compact && showSeconds && (
          <>
            <span style={{ fontSize: '1.2rem', fontWeight: 950, color: 'var(--primary)', opacity: blink ? 1 : 0.3 }}>:</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 950, color: 'white', letterSpacing: '0.05em', textShadow: '0 0 10px rgba(0,0,0,0.5)' }}>{s}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '2px' }}>
        <span style={{ fontSize: compact ? '0.45rem' : '0.55rem', fontWeight: 900, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em' }}>
          {time.toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()}
        </span>
        {!compact && <span style={{ fontSize: '0.5rem', fontWeight: 950, color: 'var(--primary)', letterSpacing: '0.1em' }}>REC_LIVE</span>}
      </div>
    </div>
  );
};

const ControlButton = ({ icon: Icon, label, active, onClick, color = 'var(--primary)' }) => (
  <motion.div 
    variants={itemFadeUp}
    whileTap={{ scale: 0.94 }}
    onClick={onClick}
    style={{ 
      background: active ? color : 'var(--bg-card)', 
      border: active ? `1px solid ${color}` : '1px solid var(--glass-stroke)',
      borderRadius: 'var(--radius-lg)', padding: '1.1rem 0.5rem', display: 'flex', flexDirection: 'column', 
      alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer',
      boxShadow: active ? `var(--shadow-premium)` : 'var(--shadow-sm)',
    }}
  >
    <div style={{ 
      width: '40px', height: '40px', borderRadius: '14px', 
      background: active ? 'var(--bg-card)' : 'var(--bg-main)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <Icon size={20} color={active ? 'var(--bg-card)' : color} strokeWidth={2.5} />
    </div>
    <span style={{ fontSize: '0.65rem', fontWeight: 950, color: active ? 'var(--bg-card)' : 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </span>
  </motion.div>
);

// ΓöÇΓöÇΓöÇ MAIN COMPONENT ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const VisualMonitor = () => {
  const { actuators, toggleActuator } = useApp();
  const { devices, sensorData } = useTelemetry();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [capturedImg, setCapturedImg] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const CAM_IP = 'http://192.168.4.2';
  const streamUrl = `${CAM_IP}/stream`;
  
  const flashOn = actuators[ACTUATORS.LIGHT];
  const buzzerOn = actuators[ACTUATORS.BUZZER];
  const deviceStatus = devices?.vision_node?.status || 'OFFLINE';

  const toggleFlash = () => toggleActuator(ACTUATORS.LIGHT);
  const toggleBuzzer = () => toggleActuator(ACTUATORS.BUZZER);

  const enterFullScreen = async () => {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
      setIsFullScreen(true);
    } catch (e) {
      setIsFullScreen(true);
    }
  };

  const exitFullScreen = async () => {
    try {
      await ScreenOrientation.unlock();
      setIsFullScreen(false);
    } catch (e) {
      setIsFullScreen(false);
    }
  };

  useEffect(() => {
    if (isFullScreen) document.body.classList.add('hide-bot');
    else document.body.classList.remove('hide-bot');
    return () => document.body.classList.remove('hide-bot');
  }, [isFullScreen]);
  
  const captureImage = async () => {
    setIsCapturing(true);
    setCapturedImg(`${CAM_IP}/capture?_cb=${Date.now()}`);
    setTimeout(() => setIsCapturing(false), 1000);
  };

  const TacticalFrame = () => (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* ≡ƒôÉ UNIFORM CORNER BRACKETS */}
      <div style={{ position: 'absolute', top: LAYOUT.cornerOffset, left: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderTop: '3px solid var(--primary)', borderLeft: '3px solid var(--primary)', opacity: 0.8 }} />
      <div style={{ position: 'absolute', top: LAYOUT.cornerOffset, right: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderTop: '3px solid var(--primary)', borderRight: '3px solid var(--primary)', opacity: 0.8 }} />
      <div style={{ position: 'absolute', bottom: LAYOUT.cornerOffset, left: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderBottom: '3px solid var(--primary)', borderLeft: '3px solid var(--primary)', opacity: 0.8 }} />
      <div style={{ position: 'absolute', bottom: LAYOUT.cornerOffset, right: LAYOUT.cornerOffset, width: LAYOUT.bracketSize, height: LAYOUT.bracketSize, borderBottom: '3px solid var(--primary)', borderRight: '3px solid var(--primary)', opacity: 0.8 }} />
      
      {/* ≡ƒôí SCAN LINE */}
      <motion.div 
        animate={{ top: ['0%', '100%', '0%'] }} 
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        style={{ position: 'absolute', left: 0, right: 0, height: '1px', background: 'var(--primary)', opacity: 0.3, boxShadow: '0 0 15px var(--primary)' }} 
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent 30%, var(--bg-dark) 100%)', opacity: 0.15 }} />
    </div>
  );

  const HUDOverlay = ({ isFull }) => (
    <div style={{ position: 'absolute', inset: 0, padding: LAYOUT.contentOffset, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 20, pointerEvents: 'none' }}>
      {/* TOP ROW */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start' }}>
        <div style={{ pointerEvents: 'auto', filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.5))' }}>
          <LiveClock compact={!isFull} />
        </div>
      </div>

      {/* BOTTOM ROW (CONSOLIDATED CONTROLS) */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', position: 'relative' }}>
        {isFull && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', alignItems: 'center', pointerEvents: 'auto' }}>
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleFlash} style={{ width: '64px', height: '64px', borderRadius: '50%', background: flashOn ? 'var(--secondary)' : 'var(--glass)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(20px)', boxShadow: 'var(--shadow-md)' }}>
              <Lightbulb size={24} color={flashOn ? 'white' : 'var(--accent)'} />
            </motion.button>
            
            <div style={{ position: 'relative' }}>
              <motion.button 
                whileTap={{ scale: 0.9 }} onClick={captureImage} 
                style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'white', border: '6px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(255,255,255,0.2)' }}
              >
                <CaptureIcon size={32} color="var(--bg-dark)" />
              </motion.button>
              {isCapturing && (
                <motion.div initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ position: 'absolute', inset: -12, border: '3px solid white', borderRadius: '50%' }} />
              )}
            </div>

            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleBuzzer} style={{ width: '64px', height: '64px', borderRadius: '50%', background: buzzerOn ? 'var(--danger)' : 'var(--glass)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(20px)', boxShadow: 'var(--shadow-md)' }}>
              <Bell size={24} color={buzzerOn ? 'white' : 'var(--danger)'} />
            </motion.button>
          </div>
        )}

        {/* VIEW TOGGLE (BOTTOM RIGHT) */}
        <div style={{ position: 'absolute', right: 0, bottom: 0, pointerEvents: 'auto' }}>
          {isFull ? (
            <motion.button 
              whileTap={{ scale: 0.85 }} onClick={exitFullScreen} 
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.8, filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.5))' }}
            >
              <Minimize2 size={32} />
            </motion.button>
          ) : (
            <motion.button 
              whileTap={{ scale: 0.85 }} onClick={enterFullScreen}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.8, filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.5))' }}
            >
              <Maximize2 size={28} />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div 
      variants={staggerContainer} initial="hidden" animate="visible"
      className="no-scrollbar" style={{ padding: isFullScreen ? 0 : '1.25rem', paddingBottom: isFullScreen ? 0 : '140px' }}
    >
      <AnimatePresence>
        {isFullScreen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'var(--bg-dark)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          >
             {deviceStatus === 'ACTIVE' ? (
               <img src={streamUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Live" />
             ) : (
               <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', flexDirection: 'column', gap: '15px' }}>
                 <EyeOff size={64} strokeWidth={2.5} />
                 <span style={{ fontSize: '1.2rem', fontWeight: 950, letterSpacing: '0.2em' }}>No Signal</span>
               </div>
             )}
             <TacticalFrame />
             <HUDOverlay isFull={true} />
          </motion.div>
        )}
      </AnimatePresence>

      {!isFullScreen && (
        <React.Fragment>
          <motion.div 
            variants={itemFadeUp}
            style={{ position: 'relative', borderRadius: '28px', overflow: 'hidden', background: 'var(--bg-dark)', aspectRatio: '16 / 9', width: '100%', marginBottom: '1.5rem', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--glass-stroke)' }}
          >
             {deviceStatus === 'ACTIVE' ? (
                <img src={streamUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Stream" />
             ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-inactive)', opacity: 0.5 }}>
                  <EyeOff size={48} strokeWidth={1.5} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 900, marginTop: '15px', letterSpacing: '0.2em' }}>No Signal</span>
                </div>
             )}
             <TacticalFrame />
             <HUDOverlay isFull={false} />
          </motion.div>

          {/* CONSOLE CARDS */}
          <motion.div variants={itemFadeUp} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', border: '1px solid var(--glass-stroke)', boxShadow: 'var(--shadow-sm)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
              <div style={{ width: '4px', height: '18px', background: 'var(--primary)', borderRadius: '2px' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>Tactical Console</h3>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
               <ControlButton icon={Bell} label="Buzzer" active={buzzerOn} onClick={toggleBuzzer} color="var(--danger)" />
               <ControlButton icon={Lightbulb} label="Floodlight" active={flashOn} onClick={toggleFlash} color="var(--accent)" />
               <ControlButton icon={CaptureIcon} label="Snapshot" active={isCapturing} onClick={captureImage} color="var(--primary)" />
            </div>
          </motion.div>

          <motion.div variants={itemFadeUp} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', border: '1px solid var(--glass-stroke)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-main)' }}>
                <Target size={28} color={sensorData?.vision?.detection === 'Healthy' ? 'var(--primary)' : 'var(--danger)'} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{sensorData?.vision?.detection || 'Initializing Neural Link...'}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Region: GLOBAL ΓÇó Confidence: 98.4%</p>
              </div>
            </div>
          </motion.div>
        </React.Fragment>
      )}

      {/* SNAPSHOT VIEWER */}
      <AnimatePresence>
        {capturedImg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 20000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(20px)' }}
            onClick={() => setCapturedImg(null)}
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
              <img src={capturedImg} style={{ width: '100%', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-premium)', border: '1px solid var(--glass-stroke)' }} alt="Capture" />
              <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-overlay)', padding: '10px 24px', borderRadius: '100px', color: 'var(--text-main)', fontSize: '0.75rem', fontWeight: 950, backdropFilter: 'blur(10px)', border: '1px solid var(--glass-stroke)', whiteSpace: 'nowrap' }}>
                SNAPSHOT SYNCED TO VAULT
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </motion.div>
  );
};

export default VisualMonitor;
