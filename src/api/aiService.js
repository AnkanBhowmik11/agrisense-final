/**
 * AgriSense AI Service
 * Handles communication with Gemini APIs.
 */

import { MASTER_CONFIG } from '../setup';

// 🔐 INDUSTRIAL KEY INJECTION (Direct Priority)
const GEMINI_API_KEY = MASTER_CONFIG.GEMINI_API_KEY;
const GROQ_API_KEY = MASTER_CONFIG.GROQ_API_KEY || import.meta.env.VITE_GROQ_API_KEY;

// 💡 Diagnostic: Log key status on load (Sanitized)
if (GROQ_API_KEY) {
  console.log(`🛰️ AgriBot: Groq Cloud AI Engine Initialized (Llama Fallback Active)`);
}
if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
  console.log(`🛰️ AgriBot: Google Gemini Cloud AI Engine Active (Handshake Ready)`);
}

/**
 * Local Agronomy Logic Engine (Fallback when API keys are missing or failing)
 */
const localAgriLogic = (prompt, context) => {
  const query = prompt.toLowerCase();
  const { currentSensors, weather, systemHealth, aiRecommendations, knowledgeBase } = context;
  
  // 1. Status Check
  if (query.includes('status') || query.includes('summary') || query.includes('how is my farm')) {
    const health = systemHealth?.overall_status || 'Unknown';
    const temp = currentSensors?.weather?.temp || '---';
    const moisture = currentSensors?.soil?.moisture || '---';
    const advice = typeof aiRecommendations?.[0] === 'object' ? (aiRecommendations[0].text || aiRecommendations[0].content) : aiRecommendations?.[0];
    
    return `### 🚜 FARM STATUS REPORT
- **Overall Health**: ${health}
- **Temperature**: ${temp}°C
- **Soil Moisture**: ${moisture}%
- **System**: ${systemHealth?.active_nodes || 0}/${systemHealth?.total_nodes || 0} nodes online.
- **Advice**: ${advice || "Everything looks stable."}`;
  }

  // 2. Irrigation Logic
  if (query.includes('irrigate') || query.includes('water') || query.includes('moisture')) {
    const moisture = parseFloat(currentSensors?.soil?.moisture);
    if (isNaN(moisture)) return "### 🔌 CONNECTION ISSUE\nI can't see your soil moisture right now. Please check if your soil node is online!";
    if (moisture < 30) return `### 🚨 CRITICAL ALERT\nSoil moisture is very low (**${moisture}%**). You should irrigate immediately! 💧`;
    if (moisture < 50) return `### ⚠️ WARNING\nSoil moisture is dipping (**${moisture}%**). Consider a light irrigation cycle soon.`;
    return `### ✅ OPTIMAL\nSoil moisture is healthy (**${moisture}%**). No irrigation needed at the moment.`;
  }

  // 3. Pest Warning
  if (query.includes('pest') || query.includes('bug') || query.includes('disease')) {
    const temp = parseFloat(currentSensors?.weather?.temp);
    const hum = parseFloat(currentSensors?.weather?.humidity);
    const pestAdvice = knowledgeBase?.pestDatabase?.find(p => {
      const cropName = p.split(':')[0].toLowerCase().split('(')[0].trim();
      return query.includes(cropName);
    });
    
    if (pestAdvice) return `### 🐛 PEST ADVICE\n${pestAdvice}\n\n*Current weather: ${temp}°C, ${hum}% humidity.*`;
    if (temp > 28 && hum > 70) return "### ⚠️ PEST ALERT\nHigh heat and humidity detected. This is a prime condition for fungal outbreaks. Keep an eye on leaf health! 🐛";
    return "### 🛡️ PROTECTED\nCurrent weather conditions are not showing high pest outbreak triggers. Continue regular monitoring.";
  }

  // 4. Fertilizer & Compost
  if (query.includes('fertilizer') || query.includes('npk') || query.includes('compost') || query.includes('dosage')) {
    const npk = currentSensors?.soil?.npk || {};
    const fertAdvice = knowledgeBase?.fertilizerDatabase?.find(f => {
      const cropName = f.split(':')[0].toLowerCase().split('(')[0].trim();
      return query.includes(cropName);
    });
    const compAdvice = knowledgeBase?.compostDatabase?.find(c => {
      const cropName = c.split(':')[0].toLowerCase().split('(')[0].trim();
      return query.includes(cropName);
    });

    let response = `### 🧪 SOIL NUTRIENTS\n- **N**: ${npk.n || '--'}\n- **P**: ${npk.p || '--'}\n- **K**: ${npk.k || '--'}`;
    if (fertAdvice) response += `\n\n### 💊 FERTILIZER\n${fertAdvice}`;
    if (compAdvice) response += `\n\n### 🌱 COMPOST\n${compAdvice}`;
    return response;
  }

  return "I'm currently analyzing your data using my Local Diagnostic Engine. I can help with 'status', 'irrigation', 'pests', 'NPK', or 'suitability'! To enable the full Cloud AI Brain, ensure your Gemini or Groq API key is active. 🌿";
};

/**
 * Uses Groq API (Llama-3-70b-versatile or 8b) as an ultra-fast fallback/alternative.
 */
const askGroq = async (prompt, systemPrompt) => {
  if (!GROQ_API_KEY) throw new Error("No Groq key available.");
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", // High capacity model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 1024
    })
  });
  
  if (!res.ok) throw new Error("Groq endpoint failed");
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
};

/**
 * Sends a message to Cloud AI with context data.
 * Auto-routes to Gemini (standard) or Groq (fallback/alt) as available.
 */
export const askGemini = async (prompt, context) => {
  const slimContext = {
    sensors: context.currentSensors,
    weather: context.weather,
    health: context.health,
    logs: context.recentLogs,
    time: context.time
  };

  const systemPrompt = `You are AgriSense AI, an elite agronomy assistant. 
Data Context:
- Farm: ${context.farmName || 'Global Plot'}
- Sensors: ${JSON.stringify(slimContext.sensors)}
- Weather: ${JSON.stringify(slimContext.weather)}
- System: ${JSON.stringify(slimContext.health)}
- History: ${JSON.stringify(slimContext.logs)}

Instructions: Provide professional, concise, action-oriented agronomic responses. Always call out specific Soil Moisture and NPK (Nitrogen, Phosphorus, Potassium) levels explicitly in your analysis whenever they are available in the telemetry. Avoid conversational fillers.`;

  // 🚀 STRATEGY: Try Groq first IF explicitly setup (lightning fast token economy) OR fallback if Gemini key fails.
  // For seamless migration, we attempt Groq if Groq exists, falling back to Gemini, then Local.
  
  if (GROQ_API_KEY) {
    try {
      console.log("🛰️ Forwarding request to Groq (Llama-3)");
      const res = await askGroq(prompt, systemPrompt);
      if (res) return res;
    } catch (e) {
      console.warn("Groq execution failed, attempting Gemini fallback...", e.message);
    }
  }

  if (!GEMINI_API_KEY) {
    return localAgriLogic(prompt, context);
  }

  const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}`;
  const model = "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY 
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });

    const data = await response.json();

    if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
  } catch (e) {
    console.error("🛰️ Gemini Network Exception:", e.message);
  }

  console.error("🛰️ Cloud AI totally offline. Defaulting to Local Diagnostic Engine.");
  return localAgriLogic(prompt, context);
};
