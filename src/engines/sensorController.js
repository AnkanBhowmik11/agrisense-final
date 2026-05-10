/**
 * AgriSense Pro v17.1.0 Sensor Controller
 * Processes incoming MQTT messages and routes them to the correct node state.
 */

import { calculateNodeHealth } from '../logic/healthEngine';

/**
 * Utility to extract numerical values from various sources with fallbacks
 */
export const getVal = (src, keys, fallback) => {
  if (src === undefined || src === null) return fallback;
  
  // If it's a direct number and no specific keys were requested, return it
  if (typeof src !== 'object' && !isNaN(src) && (!keys || keys.length === 0)) return Number(src);
  
  // If it's an object, search for the keys
  if (typeof src === 'object') {
    for (const k of keys) {
      const v = src[k];
      if (v !== undefined && v !== null && v !== "" && !isNaN(v)) return Number(v);
    }
  }
  
  return fallback;
};

/**
 * Main Data Processor for MQTT Messages
 */
export const processMqttMessage = (topic, data, prev) => {
  const parts = topic.split('/');
  if (parts.length < 2) return prev;

  console.log(`[JSON_PARSE] 🧩 Processing telemetry for node: ${parts[1]}`);

  const newState = {
    ...prev,
    soil: { ...prev.soil, npk: { ...prev.soil.npk } },
    weather: { ...prev.weather },
    water: { ...prev.water },
    storage: { ...prev.storage },
    vision: { ...prev.vision },
    hardware: prev.hardware ? { ...prev.hardware } : {}
  };
  
  // 🛰️ NODE DETECTION (Robust Keyword Matching)
  let nodeType = 'unknown';
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('sensors')) nodeType = 'sensors';
  else if (topicLower.includes('soil')) nodeType = 'soil';
  else if (topicLower.includes('weather')) nodeType = 'weather';
  else if (topicLower.includes('water') || topicLower.includes('irrigation')) nodeType = 'water';
  else if (topicLower.includes('storage')) nodeType = 'storage';
  else if (topicLower.includes('vision') || topicLower.includes('camera') || topicLower.includes('cam')) nodeType = 'vision';

  // 🛰️ UNIFIED DATA ACCEPTANCE (Accept any valid telemetry)
  if (nodeType === 'sensors' || data.soil || data.weather || data.water || data.irrigation || data.storage || data.vision) {
    if (data.soil) {
      const sData = data.soil;
      newState.soil.moisture = getVal(sData, ['moisture', 'm', 'hum'], prev.soil.moisture);
      newState.soil.ph = getVal(sData, ['ph'], prev.soil.ph);
      newState.soil.temp = getVal(sData, ['temp', 'st', 't'], prev.soil.temp);
      const npkSource = sData.npk || sData;
      newState.soil.npk.n = getVal(npkSource, ['n', 'N'], prev.soil.npk.n);
      newState.soil.npk.p = getVal(npkSource, ['p', 'P'], prev.soil.npk.p);
      newState.soil.npk.k = getVal(npkSource, ['k', 'K'], prev.soil.npk.k);
      newState.soil.oledActive = getVal(sData, ['oled', 'display'], prev.soil.oledActive);
      newState.soil.healthIndex = calculateNodeHealth('soil', newState.soil);
    }

    if (data.weather) {
      const wData = data.weather;
      newState.weather.temp = getVal(wData, ['temp', 't', 'temperature'], prev.weather.temp);
      newState.weather.humidity = getVal(wData, ['humidity', 'h', 'hum'], prev.weather.humidity);
      newState.weather.lightIntensity = getVal(wData, ['lightIntensity', 'ldr', 'light', 'lux'], prev.weather.lightIntensity);
      newState.weather.rainLevel = getVal(wData, ['rainLevel', 'rain', 'level', 'rainfall'], prev.weather.rainLevel);
      newState.weather.healthIndex = calculateNodeHealth('weather', newState.weather);
    }

    const waterSource = data.water || data.irrigation;
    if (waterSource) {
      newState.water.level = getVal(waterSource, ['level', 'l', 'water_level'], prev.water.level);
      newState.water.flow = getVal(waterSource, ['flow', 'f', 'water_flow'], prev.water.flow || 0);
      newState.water.pumpActive = (waterSource.pumpActive === 1 || waterSource.pump === 1 || waterSource.pump === "active" || waterSource.pumpActive === true || waterSource.pump === "on");
      newState.water.healthIndex = calculateNodeHealth('irrigation', newState.water);
    }

    if (data.storage) {
      const stData = data.storage;
      newState.storage.temp = getVal(stData, ['temp', 't', 'temperature'], prev.storage.temp);
      newState.storage.humidity = getVal(stData, ['humidity', 'h', 'hum'], prev.storage.humidity);
      newState.storage.mq135 = getVal(stData, ['mq135', 'gas', 'air_quality'], prev.storage.mq135);
      newState.storage.healthIndex = calculateNodeHealth('storage', newState.storage);
    }

    if (data.vision) {
      const vData = data.vision;
      newState.vision.active = vData.active === true || vData.active === 1 || vData.status === "online";
      newState.vision.type = vData.detection || vData.type || '---';
      newState.vision.level = vData.level || 'Normal';
      newState.vision.zone = vData.zone || prev.vision?.zone || '---';
      newState.vision.ip = vData.ip || prev.vision?.ip || null; // 🚀 FIXED: Default to null, never undefined
      newState.vision.timestamp = Date.now();
    }

    if (data.hardware) {
      newState.hardware = {
        ...newState.hardware,
        ...data.hardware
      };
      // Synchronize actuator statuses if present in hardware object
      if (data.hardware.pump) newState.water.pumpActive = (data.hardware.pump === "active" || data.hardware.pump === "ACTIVE" || data.hardware.pump === true || data.hardware.pump === "on");
    }
  }
  // Discrete Node Topics Fallback
  else if (nodeType === 'soil') {
    if (typeof data === 'object') {
      newState.soil.moisture = getVal(data, ['moisture', 'm', 'hum'], prev.soil.moisture);
      newState.soil.temp = getVal(data, ['temp', 't', 'st'], prev.soil.temp);
      newState.soil.ph = getVal(data, ['ph'], prev.soil.ph);
      const npkFallback = data.npk || data;
      newState.soil.npk.n = getVal(npkFallback, ['n', 'N'], prev.soil.npk.n);
      newState.soil.npk.p = getVal(npkFallback, ['p', 'P'], prev.soil.npk.p);
      newState.soil.npk.k = getVal(npkFallback, ['k', 'K'], prev.soil.npk.k);
    } else {
      newState.soil.moisture = getVal(data, [], prev.soil.moisture);
    }
    newState.soil.healthIndex = calculateNodeHealth('soil', newState.soil);
  } 
  else if (nodeType === 'weather') {
    if (typeof data === 'object') {
      newState.weather.temp = getVal(data, ['temp', 't', 'temperature'], prev.weather.temp);
      newState.weather.humidity = getVal(data, ['humidity', 'h', 'hum'], prev.weather.humidity);
      newState.weather.lightIntensity = getVal(data, ['lightIntensity', 'ldr', 'light', 'lux'], prev.weather.lightIntensity);
      newState.weather.rainLevel = getVal(data, ['rainLevel', 'rain', 'rainfall'], prev.weather.rainLevel);
    } else {
      newState.weather.temp = getVal(data, [], prev.weather.temp);
    }
    newState.weather.healthIndex = calculateNodeHealth('weather', newState.weather);
  }
  else if (nodeType === 'storage') {
    if (typeof data === 'object') {
      newState.storage.temp = getVal(data, ['temp', 't', 'temperature'], prev.storage.temp);
      newState.storage.humidity = getVal(data, ['humidity', 'h', 'hum'], prev.storage.humidity);
      newState.storage.mq135 = getVal(data, ['mq135', 'aqi', 'gas'], prev.storage.mq135);
    } else {
      newState.storage.temp = getVal(data, [], prev.storage.temp);
    }
    newState.storage.healthIndex = calculateNodeHealth('storage', newState.storage);
  }
  else if (nodeType === 'water' || nodeType === 'irrigation') {
    if (typeof data === 'object') {
      newState.water.level = getVal(data, ['level', 'l'], prev.water.level);
      newState.water.flow = getVal(data, ['flow', 'f'], prev.water.flow);
    } else {
      newState.water.level = getVal(data, [], prev.water.level);
    }
    newState.water.healthIndex = calculateNodeHealth('irrigation', newState.water);
  }

  return newState;
};
