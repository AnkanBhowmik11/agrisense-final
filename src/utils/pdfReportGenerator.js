/**
 * AgriSense PDF Report Generator — Direct jsPDF (no html2canvas = ~200KB output)
 */
import { jsPDF } from 'jspdf';

const GREEN = [16, 185, 129];
const DARK  = [15, 23, 42];
const GRAY  = [100, 116, 139];
const LIGHT = [241, 245, 249];
const WHITE = [255, 255, 255];
const RED   = [239, 68, 68];
const AMBER = [245, 158, 11];

const safe = (v, unit = '', dec = 1) => {
  if (v == null || v === '' || isNaN(Number(v))) return 'N/A';
  return `${Number(v).toFixed(dec)}${unit}`;
};

// Strip emoji & non-Latin unicode that jsPDF default font cannot render (causes gibberish)
const stripText = (str) => {
  if (!str) return '';
  return String(str)
    // Remove emoji ranges
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    // Remove other high-plane unicode
    .replace(/[^\x00-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const wrap = (pdf, text, x, y, maxW, lineH = 5) => {
  const clean = stripText(text);
  const lines = pdf.splitTextToSize(clean || '-', maxW);
  lines.forEach((l, i) => pdf.text(l, x, y + i * lineH));
  return y + lines.length * lineH;
};

const header = (pdf, title, pageNum, total) => {
  pdf.setFillColor(...DARK);
  pdf.rect(0, 0, 210, 18, 'F');
  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, 4, 18, 'F');
  pdf.setFontSize(11); pdf.setTextColor(...WHITE); pdf.setFont(undefined, 'bold');
  pdf.text('AGRISENSE PRO ADVISOR - FIELD AUDIT', 10, 11);
  pdf.setFontSize(8); pdf.setFont(undefined, 'normal');
  pdf.text(`${title} | Page ${pageNum} of ${total}`, 210 - 10, 11, { align: 'right' });
  pdf.setTextColor(...DARK);
};

const footer = (pdf, ts) => {
  pdf.setFillColor(...LIGHT);
  pdf.rect(0, 280, 210, 17, 'F');
  pdf.setFontSize(7); pdf.setTextColor(...GRAY);
  pdf.text(`Generated: ${ts}  |  AgriSense Pro  |  Encrypted & Verified`, 105, 287, { align: 'center' });
  pdf.setTextColor(...DARK);
};

const sectionTitle = (pdf, title, y) => {
  pdf.setFillColor(...GREEN);
  pdf.rect(10, y, 3, 7, 'F');
  pdf.setFontSize(10); pdf.setFont(undefined, 'bold'); pdf.setTextColor(...DARK);
  pdf.text(title, 15, y + 5.5);
  pdf.setFont(undefined, 'normal');
  return y + 12;
};

const kv = (pdf, label, value, x, y, highlight = false) => {
  pdf.setFontSize(7); pdf.setTextColor(...GRAY);
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFontSize(9); pdf.setFont(undefined, 'bold');
  pdf.setTextColor(highlight ? GREEN[0] : DARK[0], highlight ? GREEN[1] : DARK[1], highlight ? GREEN[2] : DARK[2]);
  pdf.text(String(value), x, y + 5);
  pdf.setFont(undefined, 'normal'); pdf.setTextColor(...DARK);
};

const statusChip = (pdf, label, ok, x, y) => {
  pdf.setFillColor(...(ok ? GREEN : RED));
  pdf.roundedRect(x, y - 4, 22, 6, 1.5, 1.5, 'F');
  pdf.setFontSize(6.5); pdf.setTextColor(...WHITE); pdf.setFont(undefined, 'bold');
  pdf.text(label, x + 11, y, { align: 'center' });
  pdf.setFont(undefined, 'normal'); pdf.setTextColor(...DARK);
};

const miniBar = (pdf, val, max, x, y, w = 80, color = GREEN) => {
  pdf.setFillColor(...LIGHT);
  pdf.roundedRect(x, y, w, 4, 1, 1, 'F');
  const pct = Math.min(Math.max((val / max) * w, 0), w);
  pdf.setFillColor(...color);
  pdf.roundedRect(x, y, pct, 4, 1, 1, 'F');
};

const sparkline = (pdf, data, x, y, w, h, color = GREEN) => {
  if (!data || data.length < 2) return;
  const vals = data.map(Number).filter(v => !isNaN(v));
  if (vals.length < 2) return;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = mx - mn || 1;
  const pts = vals.map((v, i) => ({
    px: x + (i / (vals.length - 1)) * w,
    py: y + h - ((v - mn) / range) * h
  }));
  pdf.setDrawColor(...color); pdf.setLineWidth(0.7);
  for (let i = 1; i < pts.length; i++) {
    pdf.line(pts[i-1].px, pts[i-1].py, pts[i].px, pts[i].py);
  }
};

const multiSparkline = (pdf, datasets, x, y, w, h) => {
  const allVals = datasets.flatMap(ds => ds.data).map(Number).filter(v => !isNaN(v));
  if (allVals.length < 2) return;
  const mn = Math.min(...allVals), mx = Math.max(...allVals);
  const range = mx - mn || 1;

  datasets.forEach(ds => {
    const vals = ds.data.map(Number).filter(v => !isNaN(v));
    if (vals.length < 2) return;
    const pts = vals.map((v, i) => ({
      px: x + (i / (vals.length - 1)) * w,
      py: y + h - ((v - mn) / range) * h
    }));
    pdf.setDrawColor(...ds.color); pdf.setLineWidth(0.9);
    for (let i = 1; i < pts.length; i++) {
      pdf.line(pts[i-1].px, pts[i-1].py, pts[i].px, pts[i].py);
    }
  });
};


/**
 * Build the PDF and return a blob URL for in-app preview.
 * Does NOT auto-download — call downloadAuditPDF() separately.
 */
export async function buildAuditPDF({ sensorData, firebaseHistory, aiText, camImageB64, gps, user, farmInfo, farmHealthScore, systemHealth, timestamp }) {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const ts = timestamp || new Date().toLocaleString();
  const TOTAL = 7;

  // ── PAGE 1: COVER & SNAPSHOT ──────────────────────────────────────────────
  header(pdf, 'EXECUTIVE OVERVIEW', 1, TOTAL);

  let y = 28;
  // Cover gradient block
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 22, 210, 50, 'F');

  pdf.setFontSize(22); pdf.setFont(undefined, 'bold'); pdf.setTextColor(...DARK);
  pdf.text('FIELD AUDIT REPORT', 105, 42, { align: 'center' });
  pdf.setFontSize(10); pdf.setFont(undefined, 'normal'); pdf.setTextColor(...GRAY);
  const nameText = stripText(`${farmInfo?.name || 'AgriSense Farm'} | ${farmInfo?.projectName || 'Season Report'}`);
  pdf.text(nameText, 105, 52, { align: 'center' });
  pdf.setFontSize(8);
  pdf.text(ts, 105, 60, { align: 'center' });

  y = 80;
  // Info grid
  const cols = [10, 58, 110, 158];
  const infos = [
    ['Operator', user?.name || user?.email || 'Field Operator'],
    ['Location', gps?.city || 'Field Location'],
    ['Crop / Season', farmInfo?.cropType || farmInfo?.projectName || 'Mixed Crop'],
    ['Health Score', `${Math.round(farmHealthScore || 0)}%`]
  ];
  infos.forEach(([label, val], i) => kv(pdf, label, val, cols[i], y));

  y = 98;
  // Camera snapshot with timestamp — only embed if it's a real image (not null/503 response)
  const hasCamImage = (
    camImageB64 &&
    typeof camImageB64 === 'string' &&
    camImageB64.startsWith('data:image') &&
    camImageB64.length > 1000 // a real image is at minimum a few KB
  );
  if (hasCamImage) {
    try {
      pdf.setFillColor(...DARK);
      pdf.rect(10, y, 90, 65, 'F');
      pdf.addImage(camImageB64, 'JPEG', 10, y, 90, 65, undefined, 'FAST');
      pdf.setFontSize(6.5); pdf.setTextColor(...WHITE);
      pdf.text(`Captured: ${ts}`, 12, y + 62);
      pdf.setTextColor(...DARK);
    } catch (_) {}
  } else {
    // Show clear OFFLINE placeholder box instead
    pdf.setFillColor(30, 41, 59);
    pdf.rect(10, y, 90, 65, 'F');
    pdf.setFontSize(8); pdf.setFont(undefined, 'bold'); pdf.setTextColor(100, 116, 139);
    pdf.text('CAMERA OFFLINE', 55, y + 30, { align: 'center' });
    pdf.setFontSize(7); pdf.setFont(undefined, 'normal');
    pdf.text('No feed available at report time', 55, y + 38, { align: 'center' });
    pdf.setTextColor(...DARK);
  }

  // Live snapshot KPIs (right side grid - fixed to prevent overlap)
  let rx1 = 108, rx2 = 158, ry = y;
  const snap = [
    ['Soil Moisture', safe(sensorData?.soil?.moisture, '%', 0)],
    ['Soil Temp', safe(sensorData?.soil?.temp, '°C')],
    ['Soil pH', safe(sensorData?.soil?.ph, '', 1)],
    ['Nitrogen (N)', safe(sensorData?.soil?.npk?.n, ' ppm', 0)],
    ['Phosphorus (P)', safe(sensorData?.soil?.npk?.p, ' ppm', 0)],
    ['Potassium (K)', safe(sensorData?.soil?.npk?.k, ' ppm', 0)],
    ['Air Temp', safe(sensorData?.weather?.temp, '°C')],
    ['Humidity', safe(sensorData?.weather?.humidity, '%', 0)],
    ['Rain', sensorData?.weather?.rainLevel > 0 ? 'Active' : 'None'],
    ['Tank Level', safe(sensorData?.water?.level, '%', 0)],
    ['Storage Temp', safe(sensorData?.storage?.temp, '°C')],
  ];
  
  snap.forEach(([l, v], i) => {
    const col = i % 2;
    kv(pdf, l, v, col === 0 ? rx1 : rx2, ry);
    if (col === 1 || i === snap.length - 1) ry += 13;
  });

  // Dynamically move to next section ensuring it is below the taller of (Image vs Grid)
  y = Math.max(y + 70, ry) + 5;
  
  footer(pdf, ts);

  // ── PAGE 2: AI MASTER ANALYSIS ───────────────────────────────────────────
  pdf.addPage();
  header(pdf, 'AI INTELLIGENCE REPORT', 2, TOTAL);
  y = 28;

  const lines = (aiText || 'Automated analysis complete.').split('\n').map(l => l.trim()).filter(Boolean);

  lines.forEach(line => {
    // Dynamic formatting trigger based on content pattern
    const isHeading = /^\d+\./.test(line) || (line.includes(':') && line.length < 40);
    const isBullet = line.startsWith('-') || line.startsWith('*');
    
    let textStr = stripText(line.replace(/^[-*]\s*/, '').replace(/\*\*/g, ''));

    if (isHeading) {
      pdf.setFont(undefined, 'bold'); pdf.setTextColor(...GREEN); pdf.setFontSize(10);
      y += 4;
    } else if (isBullet) {
      pdf.setFont(undefined, 'normal'); pdf.setTextColor(...DARK); pdf.setFontSize(8.5);
      pdf.setFillColor(...GREEN);
      pdf.circle(13, y - 1.2, 0.6, 'F'); // Styled green bullet point icon
    } else {
      pdf.setFont(undefined, 'normal'); pdf.setTextColor(...DARK); pdf.setFontSize(8.5);
    }

    // Wrap sub-components while preserving custom indentation
    const subLines = pdf.splitTextToSize(textStr, isBullet ? 175 : 185);
    const xIndent = isBullet ? 16 : 10;

    subLines.forEach(subL => {
      if (y > 275) {
        footer(pdf, ts); pdf.addPage();
        header('AI INTELLIGENCE REPORT (CONT.)', 2, TOTAL);
        y = 28;
        // restore font styles for current line continuation
        if (isHeading) { pdf.setFont(undefined, 'bold'); pdf.setTextColor(...GREEN); pdf.setFontSize(10); }
        else { pdf.setFont(undefined, 'normal'); pdf.setTextColor(...DARK); pdf.setFontSize(8.5); }
      }
      pdf.text(subL, xIndent, y);
      y += 5.2;
    });

    y += 2; // Inter-paragraph vertical density spacer
  });

  footer(pdf, ts);

  // ── PAGE 3: SOIL FORENSICS ───────────────────────────────────────────────
  pdf.addPage();
  header(pdf, 'SOIL NODE DIAGNOSTICS', 3, TOTAL);
  y = 28;

  y = sectionTitle(pdf, 'SOIL TELEMETRY & NUTRIENTS', y);
  const soil = sensorData?.soil || {};
  const soilMetrics = [
    { label: 'Moisture', val: soil.moisture, max: 100, unit: '%', ok: soil.moisture >= 30 && soil.moisture <= 80 },
    { label: 'Soil Temp', val: soil.temp, max: 50, unit: '°C', ok: soil.temp >= 15 && soil.temp <= 35 },
    { label: 'pH Level', val: soil.ph, max: 14, unit: '', ok: soil.ph >= 5.5 && soil.ph <= 7.5 },
    { label: 'Nitrogen (N)', val: soil.npk?.n, max: 300, unit: 'ppm', ok: soil.npk?.n >= 100 },
    { label: 'Phosphorus (P)', val: soil.npk?.p, max: 200, unit: 'ppm', ok: soil.npk?.p >= 50 },
    { label: 'Potassium (K)', val: soil.npk?.k, max: 300, unit: 'ppm', ok: soil.npk?.k >= 80 },
  ];
  soilMetrics.forEach(m => {
    pdf.setFontSize(8.5); pdf.setFont(undefined, 'bold'); pdf.setTextColor(...DARK);
    pdf.text(m.label, 10, y);
    pdf.setFont(undefined, 'normal'); pdf.setTextColor(...GRAY);
    pdf.text(safe(m.val, m.unit), 70, y);
    statusChip(pdf, m.ok ? 'OPTIMAL' : 'CHECK', m.ok, 90, y);
    miniBar(pdf, m.val || 0, m.max, 120, y - 3.5, 80, m.ok ? GREEN : AMBER);
    y += 11;
  });

  if (firebaseHistory?.length > 2) {
    y = sectionTitle(pdf, 'MOISTURE TREND (7-DAY HISTORY)', y + 4);
    const moistureVals = firebaseHistory.map(d => d?.soil?.moisture).filter(v => v != null);
    pdf.setFillColor(...LIGHT); pdf.rect(10, y, 190, 38, 'F');
    sparkline(pdf, moistureVals, 12, y + 2, 186, 34, GREEN);
    y += 48;

    y = sectionTitle(pdf, 'NPK NUTRIENT TRENDS (OVERLAY)', y);
    pdf.setFillColor(...LIGHT); pdf.rect(10, y, 190, 40, 'F');
    
    const nDs = { data: firebaseHistory.map(d => d?.soil?.npk?.n).filter(v => v != null), color: [34, 197, 94] }; // Emerald
    const pDs = { data: firebaseHistory.map(d => d?.soil?.npk?.p).filter(v => v != null), color: [168, 85, 247] }; // Purple
    const kDs = { data: firebaseHistory.map(d => d?.soil?.npk?.k).filter(v => v != null), color: [245, 158, 11] }; // Amber
    
    multiSparkline(pdf, [nDs, pDs, kDs], 12, y + 2, 186, 36);

    // Legend
    pdf.setFontSize(7); pdf.setFont(undefined, 'bold');
    pdf.setTextColor(34, 197, 94); pdf.text('N', 12, y + 45);
    pdf.setTextColor(168, 85, 247); pdf.text('P', 20, y + 45);
    pdf.setTextColor(245, 158, 11); pdf.text('K', 28, y + 45);
    pdf.setTextColor(...GRAY); pdf.setFont(undefined, 'normal');
    pdf.text(`${Math.max(nDs.data.length, pDs.data.length, kDs.data.length)} cycles tracked`, 190, y + 45, { align: 'right' });
  }
  footer(pdf, ts);

  // ── PAGE 4: WEATHER FORENSICS ────────────────────────────────────────────
  pdf.addPage();
  header(pdf, 'WEATHER & ATMOSPHERE', 4, TOTAL);
  y = 28;

  y = sectionTitle(pdf, 'WEATHER NODE TELEMETRY', y);
  const wx = sensorData?.weather || {};
  const wxM = [
    { label: 'Air Temperature', val: wx.temp, unit: '°C', ok: wx.temp < 38 },
    { label: 'Humidity', val: wx.humidity, unit: '%', ok: wx.humidity < 85 },
    { label: 'Light (LDR)', val: wx.ldr, unit: '', ok: true },
    { label: 'Rainfall', val: wx.rainLevel > 0 ? 'Active' : 'None', unit: '', ok: true },
  ];
  wxM.forEach(m => {
    kv(pdf, m.label, safe(m.val, m.unit) === 'N/A' ? (m.val || 'N/A') : safe(m.val, m.unit), 10, y);
    statusChip(pdf, m.ok ? 'OK' : 'ALERT', m.ok, 60, y);
    y += 13;
  });

  if (firebaseHistory?.length > 2) {
    const tempVals = firebaseHistory.map(d => d?.weather?.temp).filter(v => v != null);
    if (tempVals.length > 2) {
      y = sectionTitle(pdf, 'TEMPERATURE TREND', y + 4);
      pdf.setFillColor(...LIGHT); pdf.rect(10, y, 190, 38, 'F');
      sparkline(pdf, tempVals, 12, y + 2, 186, 34, AMBER);
      y += 48;
    }

    const humVals = firebaseHistory.map(d => d?.weather?.humidity).filter(v => v != null);
    if (humVals.length > 2) {
      y = sectionTitle(pdf, 'HUMIDITY TREND', y + 4);
      pdf.setFillColor(...LIGHT); pdf.rect(10, y, 190, 38, 'F');
      sparkline(pdf, humVals, 12, y + 2, 186, 34, [59, 130, 246]);
      y += 48;
    }
  }
  footer(pdf, ts);

  // ── PAGE 5: IRRIGATION FORENSICS ──────────────────────────────────────────
  pdf.addPage();
  header(pdf, 'IRRIGATION DIAGNOSTICS', 5, TOTAL);
  y = 28;

  y = sectionTitle(pdf, 'IRRIGATION NODE', y);
  const water = sensorData?.water || {};
  const waterM = [
    { label: 'Tank Level', val: water.level, unit: '%', ok: water.level >= 20 },
    { label: 'Flow Rate', val: water.flow, unit: ' L/h', ok: true },
    { label: 'Pump Status', val: water.pumpActive ? 'ON' : 'OFF', ok: true },
  ];
  waterM.forEach(m => {
    kv(pdf, m.label, typeof m.val === 'boolean' ? (m.val ? 'TRUE' : 'FALSE') : safe(m.val, m.unit), 10, y);
    statusChip(pdf, m.ok ? 'OK' : 'LOW', m.ok, 60, y);
    y += 13;
  });

  if (firebaseHistory?.length > 2) {
    const lvlVals = firebaseHistory.map(d => d?.water?.level).filter(v => v != null);
    if (lvlVals.length > 2) {
      y = sectionTitle(pdf, 'TANK STORAGE TREND', y + 6);
      pdf.setFillColor(...LIGHT); pdf.rect(10, y, 190, 45, 'F');
      sparkline(pdf, lvlVals, 12, y + 2, 186, 41, [59, 130, 246]);
      y += 55;
    }
  }
  footer(pdf, ts);

  // ── PAGE 6: STORAGE & HEALTH ─────────────────────────────────────────────
  pdf.addPage();
  header(pdf, 'SYSTEM HEALTH & STORAGE', 6, TOTAL);
  y = 28;

  y = sectionTitle(pdf, 'STORAGE FACILITY NODE', y);
  const st = sensorData?.storage || {};
  [['Silo Temp', st.temp, '°C'], ['Gas / MQ135', st.mq135, ' ppm'], ['Storage Hum', st.humidity, '%']].forEach(([l, v, u]) => {
    kv(pdf, l, safe(v, u), 10, y); y += 13;
  });

  if (firebaseHistory?.length > 2) {
    const stTempVals = firebaseHistory.map(d => d?.storage?.temp).filter(v => v != null);
    if (stTempVals.length > 2) {
      y = sectionTitle(pdf, 'STORAGE TEMP TREND', y + 4);
      pdf.setFillColor(...LIGHT); pdf.rect(10, y, 190, 35, 'F');
      sparkline(pdf, stTempVals, 12, y + 2, 186, 31, AMBER);
      y += 44;
    }
  }

  y = sectionTitle(pdf, 'NODE HEALTH MATRIX', y + 4);
  const nodeHealth = [
    { name: 'Soil Node', score: systemHealth?.soil },
    { name: 'Weather Node', score: systemHealth?.weather },
    { name: 'Irrigation Node', score: systemHealth?.water },
    { name: 'Storage Node', score: systemHealth?.storage },
  ];
  nodeHealth.forEach(n => {
    const sc = Math.round(n.score || 0);
    const ok = sc >= 60;
    pdf.setFontSize(9); pdf.setFont(undefined, 'bold'); pdf.setTextColor(...DARK);
    pdf.text(n.name, 10, y);
    pdf.setFont(undefined, 'normal');
    pdf.text(`${sc}%`, 80, y);
    statusChip(pdf, ok ? 'HEALTHY' : 'DEGRADED', ok, 92, y);
    miniBar(pdf, sc, 100, 120, y - 3.5, 78, ok ? GREEN : AMBER);
    y += 12;
  });

  // Center ring
  y += 8;
  pdf.setFillColor(...(farmHealthScore >= 70 ? GREEN : AMBER));
  pdf.circle(105, y + 20, 20, 'F');
  pdf.setFontSize(18); pdf.setFont(undefined, 'bold'); pdf.setTextColor(...WHITE);
  pdf.text(`${Math.round(farmHealthScore || 0)}`, 105, y + 18, { align: 'center' });
  pdf.setFontSize(8); pdf.setFont(undefined, 'normal');
  pdf.text('%', 105, y + 24, { align: 'center' });
  pdf.setTextColor(...DARK); pdf.setFontSize(9);
  pdf.text('OVERALL FARM RATING', 105, y + 46, { align: 'center' });

  y += 60;
  if (firebaseHistory?.length > 0) {
    pdf.setFontSize(8); pdf.setTextColor(...GRAY);
    pdf.text(`Telemetry dataset contains ${firebaseHistory.length} archival packets.`, 105, y, { align: 'center' });
    const oldest = firebaseHistory[0]?.timestamp;
    const newest = firebaseHistory[firebaseHistory.length - 1]?.timestamp;
    if (oldest && newest) {
      pdf.text(`Audit Coverage: ${new Date(oldest).toLocaleDateString()} to ${new Date(newest).toLocaleDateString()}`, 105, y + 6, { align: 'center' });
    }
  }
  footer(pdf, ts);

  // ── PAGE 7: RECOMMENDATIONS & SIGN-OFF ───────────────────────────────────
  pdf.addPage();
  header(pdf, 'EXPERT RECOMMENDATIONS', 7, TOTAL);
  y = 28;

  y = sectionTitle(pdf, 'AGRISENSE AI RECOMMENDATIONS', y);

  const recs = [];
  const s = sensorData?.soil;
  const w = sensorData?.weather;
  const wa = sensorData?.water;
  if (s?.moisture != null && s.moisture < 35) recs.push('CRITICAL: Soil moisture below 35%. Activate irrigation immediately to prevent crop stress.');
  if (s?.moisture != null && s.moisture > 80) recs.push('WARNING: Soil moisture above 80%. Risk of root rot - reduce irrigation frequency.');
  if (s?.ph != null && (s.ph < 5.5 || s.ph > 7.5)) recs.push(`WARNING: Soil pH (${safe(s.ph)}) is outside optimal range 5.5-7.5. Consider liming or sulfur treatment.`);
  if (s?.npk?.n != null && s.npk.n < 80) recs.push('ACTION: Low Nitrogen detected. Apply balanced NPK fertilizer or organic compost within 72h.');
  if (w?.temp != null && w.temp > 35) recs.push('ALERT: Heat index detected above 35°C. Consider shading strategies and increase water monitoring.');
  if (wa?.level != null && wa.level < 25) recs.push('URGENT: Irrigation tank level below 25%. Initiate reservoir replenishment immediately.');
  if (recs.length === 0) recs.push('All systems nominal. Current readings reflect a highly optimized and sustainable field balance.');

  recs.forEach(r => {
    pdf.setFillColor(...LIGHT);
    pdf.roundedRect(10, y, 190, 14, 2, 2, 'F');
    pdf.setFillColor(...GREEN);
    pdf.rect(10, y, 2, 14, 'F');
    pdf.setFontSize(8); pdf.setTextColor(...DARK);
    wrap(pdf, r, 15, y + 5, 180, 4.5);
    y += 18;
  });

  y = sectionTitle(pdf, 'AUDIT CERTIFICATION', Math.max(y + 5, 200));
  pdf.setFontSize(8.5); pdf.setTextColor(...GRAY);
  const cert = [
    `Report ID: AS-${Date.now().toString().slice(-8)}`,
    `Generated by: AgriSense Pro AI Engine`,
    `Operator: ${user?.name || user?.email || 'Field Operator'}`,
    `Farm: ${farmInfo?.name || 'AgriSense Farm'}`,
    `Location: ${gps?.city || 'GPS Logged'} (${gps?.lat?.toFixed(4) || '--'}, ${gps?.lng?.toFixed(4) || '--'})`,
    `Timestamp: ${ts}`
  ];
  cert.forEach(txt => { pdf.text(txt, 15, y); y += 6; });

  // Decorative seal
  pdf.setDrawColor(...GREEN); pdf.setLineWidth(0.5);
  pdf.circle(180, y - 20, 15, 'S');
  pdf.setFontSize(6); pdf.setFont(undefined, 'bold'); pdf.setTextColor(...GREEN);
  pdf.text('CERTIFIED', 180, y - 21, { align: 'center' });
  pdf.text('AUDIT', 180, y - 17, { align: 'center' });
  
  footer(pdf, ts);

  return pdf.output('bloburl');
}

/**
 * Trigger the actual file download from a previously built blob URL.
 */
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function downloadAuditPDF(blobUrl, dateStr) {
  const fileName = `AgriSense_Audit_${dateStr || new Date().toISOString().split('T')[0]}.pdf`;

  try {
    if (window.Capacitor?.isNativePlatform()) {
      // Native Capacitor Download
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      // Capacitor requires pure base64 without the data URI prefix
      const pureBase64 = typeof base64Data === 'string' ? base64Data.split(',')[1] || base64Data : base64Data;

      // Write directly to the public Documents directory
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: pureBase64,
        directory: Directory.Documents
      });

      // Show a success alert instead of opening Share menu
      alert(`Report downloaded successfully to Documents folder as ${fileName}`);

    } else {
      // Standard Web Download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (error) {
    console.error("Error saving PDF:", error);
    alert("Could not save PDF: " + error.message);
  }
}
