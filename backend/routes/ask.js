const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const { NODES } = require('../data/nerNetwork');
const { findRoute } = require('../utils/dijkstra');
const { fetchNodeWeather } = require('./weather');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

/**
 * Fallback AI engine when no OPENAI_API_KEY is configured.
 * Performs intelligent analysis on network status, Dijkstra route computation, weather,
 * field reports, calculations, and user-scoped data.
 */
async function generateLocalAIResponse(query, user, context = {}) {
  const q = (query || '').toLowerCase().trim();

  // 0. Arithmetic / Math calculation check
  const cleanMathExpr = q.replace(/ /g, '');
  const mathMatch = cleanMathExpr.match(/^(\d+(?:\.\d+)?)([\+\-\*\/])(\d+(?:\.\d+)?)$/);
  if (mathMatch) {
    const num1 = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const num2 = parseFloat(mathMatch[3]);
    let result;
    if (op === '+') result = num1 + num2;
    else if (op === '-') result = num1 - num2;
    else if (op === '*') result = num1 * num2;
    else if (op === '/') result = num2 !== 0 ? num1 / num2 : 'undefined (division by zero)';
    return {
      answer: `**Calculation Result:**\n\n\`${num1} ${op} ${num2} = ${result}\``,
      contextUsed: { type: 'calculation', expression: q, result },
    };
  }

  // 1. Check if user is asking about routes between specific towns
  const nodeMatches = NODES.filter((n) => q.includes(n.name.toLowerCase()) || q.includes(n.id.toLowerCase()));
  if (nodeMatches.length >= 2 || (q.includes('route') || q.includes('from') || q.includes('to') || q.includes('reach') || q.includes('travel') || q.includes('distance') || q.includes('eta'))) {
    let origin = nodeMatches[0] || NODES.find((n) => n.id === 'guwahati');
    let destination = nodeMatches[1] || NODES.find((n) => n.id === 'jorhat');

    if (nodeMatches.length === 1) {
      const userDistrictNode = NODES.find((n) => n.name.toLowerCase() === (user.district || '').toLowerCase() || n.id === (user.district || '').toLowerCase());
      if (userDistrictNode && userDistrictNode.id !== nodeMatches[0].id) {
        origin = userDistrictNode;
        destination = nodeMatches[0];
      } else if (nodeMatches[0].id !== 'guwahati') {
        origin = NODES.find((n) => n.id === 'guwahati');
        destination = nodeMatches[0];
      } else {
        destination = NODES.find((n) => n.id === 'shillong');
      }
    }

    try {
      const weatherSeverityByNode = {};
      await Promise.all(NODES.map(async (n) => {
        try { weatherSeverityByNode[n.id] = (await fetchNodeWeather(n)).severity; } catch (_) { weatherSeverityByNode[n.id] = 0; }
      }));
      const disruptions = await supabaseService.getActiveDisruptions();

      const route = findRoute(origin.id, destination.id, { weatherSeverityByNode, disruptions });
      if (route) {
        const hours = Math.floor(route.etaMinutes / 60);
        const mins = route.etaMinutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const segmentSummary = route.edges.map((e) => `${e.from.name} → ${e.to.name} (${e.road}, ${e.km}km, condition: ${e.condition})`).join('; ');

        return {
          answer: `**Recommended Route from ${origin.name} to ${destination.name}:**\n\n` +
            `• **Distance:** ${route.totalKm} km\n` +
            `• **Estimated Travel Time:** ${timeStr} (Avg Speed: ${route.avgSpeedKmh} km/h)\n` +
            `• **Safety Index:** ${route.safetyIndex}%\n` +
            `• **Route Segments:** ${segmentSummary}\n\n` +
            `*Safety Note:* Weather conditions and active field reports were factored into this calculation. Drive carefully!`,
          contextUsed: { type: 'route_calculation', origin: origin.name, destination: destination.name, distanceKm: route.totalKm },
        };
      }
    } catch (err) {
      console.error('Local route calculation error:', err);
    }
  }

  // 2. Weather query
  if (q.includes('weather') || q.includes('rain') || q.includes('flood') || q.includes('storm') || q.includes('climate') || q.includes('forecast')) {
    const matchedNode = nodeMatches[0] || NODES.find((n) => n.name.toLowerCase() === (user.district || '').toLowerCase()) || NODES.find((n) => n.id === 'guwahati');
    try {
      const weather = await fetchNodeWeather(matchedNode);
      return {
        answer: `**Live Weather Intelligence for ${matchedNode.name} (${matchedNode.state}):**\n\n` +
          `• **Condition:** ${weather.label}\n` +
          `• **Temperature:** ${weather.temperature || 24}°C\n` +
          `• **Precipitation:** ${weather.precipitation || 0} mm\n` +
          `• **Wind Speed:** ${weather.windspeed || 12} km/h\n` +
          `• **Risk Severity Level:** ${(weather.severity * 100).toFixed(0)}%\n\n` +
          (weather.severity > 0.4 ? `⚠️ *Caution:* High moisture or weather disruption detected near ${matchedNode.name}. Allow extra travel time.` : `✅ Travel conditions near ${matchedNode.name} are currently favorable.`),
        contextUsed: { type: 'weather', node: matchedNode.name, weather },
      };
    } catch (_) {}
  }

  // 3. Landslide / Disruption / Field Reports query
  if (q.includes('disruption') || q.includes('landslide') || q.includes('block') || q.includes('road') || q.includes('hazard') || q.includes('report') || q.includes('incident')) {
    const allIncidents = await supabaseService.getIncidents(10);
    const openReports = allIncidents.filter((r) => r.status !== 'resolved').slice(0, 5);
    if (openReports.length > 0) {
      const reportList = openReports.map((r) => `• **[${(r.severity || 'MODERATE').toUpperCase()}] ${r.title}**: ${r.description || 'No extra details'} (Category: ${(r.category || 'other').replace('_', ' ')})`).join('\n');
      return {
        answer: `**Active Road Disruption Reports in North East Region:**\n\n${reportList}\n\n*Tip:* Field officers can submit live geo-tagged incident updates directly from their workspace.`,
        contextUsed: { type: 'field_reports', count: openReports.length },
      };
    } else {
      return {
        answer: `**Road Disruption Status:**\n\nCurrently, there are no open high-priority road blockages or landslide reports logged in the system. All major corridors (NH27, NH6, NH2, NH37) are operational.`,
        contextUsed: { type: 'field_reports', count: 0 },
      };
    }
  }

  // 4. Alerts query
  if (q.includes('alert') || q.includes('warning') || q.includes('notice') || q.includes('broadcasting')) {
    const alerts = await supabaseService.getAlerts(5);
    if (alerts.length > 0) {
      const alertList = alerts.map((a) => `• **${a.type}** (${a.severity}): ${a.title} - ${a.text}`).join('\n');
      return {
        answer: `**Current Regional Alerts:**\n\n${alertList}`,
        contextUsed: { type: 'alerts', count: alerts.length },
      };
    }
  }

  // 5. User / Workspace query
  if (q.includes('my') || q.includes('shipment') || q.includes('vehicle') || q.includes('profile') || q.includes('workspace') || q.includes('role')) {
    if (user.role === 'logistics') {
      const shipments = await supabaseService.getShipments(user.id, 'logistics');
      return {
        answer: `**Logistics Workspace Summary for ${user.name}:**\n\n` +
          `• **Role:** Logistics Operator (${user.organisation || 'NER Freight'})\n` +
          `• **Active Shipments:** ${shipments.length}\n` +
          (shipments.length > 0 ? `• **Latest Shipment:** ${shipments[0].originNode.toUpperCase()} → ${shipments[0].destinationNode.toUpperCase()} (Status: ${shipments[0].status})` : '• You have no active shipments currently.'),
        contextUsed: { type: 'user_logistics', shipmentCount: shipments.length },
      };
    } else if (user.role === 'driver') {
      const vehicles = await supabaseService.getVehicles(user.id);
      return {
        answer: `**Driver Workspace Summary for ${user.name}:**\n\n` +
          `• **Vehicle Number:** ${user.vehicleNumber || 'Registered Driver'}\n` +
          `• **Assigned Vehicles:** ${vehicles.length}\n` +
          `• **District / State:** ${user.district || 'Assam'}, ${user.state || 'NER'}\n\n` +
          `Use the Route Planner to get live GPS risk-weighted guidance before setting out.`,
        contextUsed: { type: 'user_driver', vehicleCount: vehicles.length },
      };
    } else if (user.role === 'field') {
      const myReports = await supabaseService.getIncidentsByUserId(user.id);
      return {
        answer: `**Field Officer Workspace Summary for ${user.name}:**\n\n` +
          `• **Unit / Org:** ${user.organisation || 'PWD Field Unit'}\n` +
          `• **District Posting:** ${user.district || 'Assam'}\n` +
          `• **Reports Submitted by You:** ${myReports.length}\n\n` +
          `You can file new geo-tagged incident reports with photo attachments even when offline.`,
        contextUsed: { type: 'user_field', reportCount: myReports.length },
      };
    } else if (user.role === 'official') {
      const { total } = await supabaseService.listUsers();
      const allIncidents = await supabaseService.getIncidents();
      const totalReports = allIncidents.filter((r) => r.status !== 'resolved').length;
      return {
        answer: `**Official Briefing Room Summary for ${user.name}:**\n\n` +
          `• **Department:** ${user.department || 'DoNER / Regional Office'}\n` +
          `• **Registered Personnel Across Region:** ${total}\n` +
          `• **Active Open Hazards:** ${totalReports}\n\n` +
          `You have full access to the District Connectivity Dashboard and Regional Team Directory.`,
        contextUsed: { type: 'user_official', totalUsers: total, totalReports },
      };
    }
  }

  // 6. Emergency / Contact query
  if (q.includes('emergency') || q.includes('help') || q.includes('contact') || q.includes('phone') || q.includes('number') || q.includes('police') || q.includes('hospital')) {
    return {
      answer: `**Emergency Support & Critical Helpline Numbers for NER:**\n\n` +
        `• **National Emergency Helpline:** 112\n` +
        `• **Disaster Management (NDRF/SDRF):** 1070 / 1077\n` +
        `• **Ambulance Service:** 108\n` +
        `• **Highway Police Helpline:** 1033\n` +
        `• **NER Sahayak Control Room:** +91 90000 00000\n\n` +
        `Stay safe! In case of flash floods or landslides, seek high ground immediately.`,
      contextUsed: { type: 'emergency_contacts' },
    };
  }

  // Default general assistant response
  return {
    answer: `Hello **${user.name}**! I am **Ask Sahayak**, your AI assistant for logistics, route safety, and regional intelligence in North East India.\n\n` +
      `Here are some things I can help you with:\n` +
      `1. **Find Safest Route**: *"What is the safest route from Guwahati to Silchar?"*\n` +
      `2. **Check Weather**: *"How is the weather near Nagaon today?"*\n` +
      `3. **Active Hazards**: *"Are there any active landslide or flood reports?"*\n` +
      `4. **Workspace Summary**: *"Show my active shipments / workspace status"*\n` +
      `5. **Emergency Contacts**: *"Show emergency numbers"*\n\n` +
      `How can I assist your journey today?`,
    contextUsed: { type: 'general' },
  };
}

async function handleAskRequest(req, res) {
  const { query, context } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'A query string is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // If OpenAPI Key is provided, send request to OpenAI-compatible endpoint
  if (apiKey) {
    try {
      const activeAlerts = await supabaseService.getAlerts(5);
      const allIncidents = await supabaseService.getIncidents(10);
      const openReports = allIncidents.filter((r) => r.status !== 'resolved').slice(0, 5);

      const systemPrompt = `You are "Ask Sahayak", an AI assistant for the NER-Sahayak platform (North Eastern Region Smart Logistics & Accessibility Intelligence Platform in India).
You assist users (${req.user.name}, role: ${req.user.role}, district: ${req.user.district || 'Assam'}) with road navigation, weather hazards, logistics, and emergency response.

Current Live Platform Context:
- Available Network Towns: Guwahati, Shillong, Nagaon, Jorhat, Dibrugarh, Tezpur, Silchar, Imphal, Kohima, Aizawl, Agartala, Itanagar, Gangtok, Tawang, Dimapur, Haflong, etc.
- Active Alerts: ${JSON.stringify(activeAlerts)}
- Open Disruption Reports: ${JSON.stringify(openReports)}
- User State: ${JSON.stringify({ name: req.user.name, role: req.user.role, email: req.user.email, district: req.user.district, state: req.user.state })}

Provide concise, highly helpful, clear responses formatted in clean markdown.`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`OpenAPI call failed (${response.status}): ${errText}. Falling back to local intelligence engine.`);
        const fallback = await generateLocalAIResponse(query, req.user, context);
        return res.json({ ...fallback, mode: 'local_fallback', apiNotice: `OpenAPI status ${response.status}` });
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || 'No response received from AI model.';
      return res.json({
        answer,
        mode: 'openapi',
        model,
        contextUsed: { userRole: req.user.role, district: req.user.district },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('OpenAPI request error:', err);
      const fallback = await generateLocalAIResponse(query, req.user, context);
      return res.json({ ...fallback, mode: 'local_fallback', error: err.message });
    }
  }

  // Default: Execute local intelligence engine
  try {
    const fallback = await generateLocalAIResponse(query, req.user, context);
    return res.json({
      ...fallback,
      mode: 'local_engine',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate answer', detail: err.message });
  }
}

// Handle both POST / and POST /ask to avoid path mismatch
router.post('/', requireAuth, handleAskRequest);
router.post('/ask', requireAuth, handleAskRequest);

module.exports = router;
