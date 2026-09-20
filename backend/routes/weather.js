const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const { NODES } = require('../data/nerNetwork');

const router = express.Router();

// Simple in-memory cache to avoid hammering the weather API.
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Convert OpenWeatherMap condition codes + precipitation + wind into a 0-1 severity
 * score used to weight the route optimizer, plus a human label.
 * https://openweathermap.org/weather-conditions
 */
function scoreWeather(current) {
  // Extract data from OpenWeatherMap response
  const code = current.weather && current.weather.length > 0 ? current.weather[0].id : 800;
  // Convert m/s to km/h for wind
  const wind = current.wind && current.wind.speed ? current.wind.speed * 3.6 : 0; 
  // Get 1 hour rain volume if available (mm)
  const precip = current.rain && current.rain['1h'] ? current.rain['1h'] : 0; 

  let severity = 0;
  let label = 'Clear';

  if (code >= 200 && code < 300) { severity = 0.95; label = 'Thunderstorm'; }
  else if (code >= 300 && code < 400) { severity = 0.35; label = 'Drizzle'; }
  else if (code >= 500 && code < 600) { 
    if (code === 500) { severity = 0.35; label = 'Light rain'; }
    else if (code === 501) { severity = 0.65; label = 'Moderate rain'; }
    else { severity = 0.9; label = 'Heavy rain'; }
  }
  else if (code >= 600 && code < 700) { severity = 0.8; label = 'Snow'; }
  else if (code >= 700 && code < 800) { severity = 0.4; label = 'Fog/Mist'; }
  else if (code === 800) { severity = 0.05; label = 'Clear'; }
  else if (code > 800) { severity = 0.1; label = 'Clouds'; }

  if (wind > 40) severity = Math.min(1, severity + 0.2);
  if (precip > 10) severity = Math.min(1, severity + 0.15);

  return { severity: Number(severity.toFixed(2)), label, windspeed: wind, precipitation: precip, code };
}

async function fetchNodeWeather(node) {
  const key = node.id;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  const apiKey = process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('WEATHER_API_KEY is missing from environment variables');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${node.lat}&lon=${node.lng}&appid=${apiKey}&units=metric`;
  const resp = await fetch(url, { timeout: 8000 });
  if (!resp.ok) throw new Error(`OpenWeather API error for ${node.name}: ${resp.status} ${resp.statusText}`);
  const json = await resp.json();

  const scored = scoreWeather(json);
  const data = {
    nodeId: node.id,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
    temperature: json.main ? json.main.temp : null,
    windspeed: scored.windspeed, // mapped to km/h by scoreWeather
    ...scored,
    observedAt: new Date().toISOString(),
  };
  cache.set(key, { time: Date.now(), data });
  return data;
}

// GET /api/weather/all — live weather + risk severity for every network node
router.get('/all', requireAuth, async (req, res) => {
  try {
    const results = await Promise.all(NODES.map((n) => fetchNodeWeather(n).catch((e) => ({
      nodeId: n.id, name: n.name, lat: n.lat, lng: n.lng, error: e.message, severity: 0, label: 'Unavailable',
    }))));
    res.json({ nodes: results, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: 'Unable to reach live weather service', detail: err.message });
  }
});

// GET /api/weather/:nodeId — live weather for a single node
router.get('/:nodeId', requireAuth, async (req, res) => {
  const node = NODES.find((n) => n.id === req.params.nodeId);
  if (!node) return res.status(404).json({ error: 'Unknown location' });
  try {
    const data = await fetchNodeWeather(node);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Unable to reach live weather service', detail: err.message });
  }
});

module.exports = router;
module.exports.fetchNodeWeather = fetchNodeWeather;
