const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const { NODES } = require('../data/nerNetwork');

const router = express.Router();

// In-memory cache to respect API rate limits (10 minutes TTL)
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

/**
 * Universal timeout-protected HTTP JSON fetcher.
 */
async function fetchWithTimeout(url, timeoutMs = 4000) {
  const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch : fetch;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const opts = controller ? { signal: controller.signal } : { timeout: timeoutMs };
    const resp = await fetchFn(url, opts);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    return await resp.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Convert OpenWeatherMap condition codes + precipitation + wind into a 0-1 severity
 * score used to weight the route optimizer, plus a human label.
 * https://openweathermap.org/weather-conditions
 */
function scoreWeather(current) {
  const code = current.weather && current.weather.length > 0 ? current.weather[0].id : 800;
  // Convert m/s to km/h for wind if from OWM (units=metric returns m/s)
  const wind = current.wind && current.wind.speed ? current.wind.speed * 3.6 : 0; 
  const precip = current.rain && current.rain['1h'] ? current.rain['1h'] : 0; 

  let severity = 0.05;
  let label = 'Clear';

  if (code >= 200 && code < 300) { severity = 0.95; label = 'Thunderstorm'; }
  else if (code >= 300 && code < 400) { severity = 0.35; label = 'Drizzle'; }
  else if (code >= 500 && code < 600) { 
    if (code === 500) { severity = 0.35; label = 'Light rain'; }
    else if (code === 501) { severity = 0.65; label = 'Moderate rain'; }
    else { severity = 0.90; label = 'Heavy rain'; }
  }
  else if (code >= 600 && code < 700) { severity = 0.80; label = 'Snow'; }
  else if (code >= 700 && code < 800) { severity = 0.40; label = 'Fog/Mist'; }
  else if (code === 800) { severity = 0.05; label = 'Clear'; }
  else if (code > 800) { severity = 0.10; label = 'Clouds'; }

  if (wind > 40) severity = Math.min(1.0, severity + 0.20);
  if (precip > 10) severity = Math.min(1.0, severity + 0.15);

  return {
    severity: Number(Math.max(0, Math.min(1, severity)).toFixed(2)),
    label,
    windspeed: Number(wind.toFixed(1)),
    precipitation: Number(precip.toFixed(1)),
    code
  };
}

/**
 * Convert Open-Meteo WMO weather codes + precipitation + wind into a 0-1 severity score.
 * https://open-meteo.com/en/docs
 */
function scoreOpenMeteoWeather(current = {}) {
  const code = current.weather_code ?? 0;
  const wind = current.wind_speed_10m ?? 0; // Open-Meteo default is km/h
  const precip = current.precipitation ?? 0; // mm

  let severity = 0.05;
  let label = 'Clear sky';

  if (code === 0) {
    severity = 0.05;
    label = 'Clear sky';
  } else if (code >= 1 && code <= 3) {
    severity = 0.10;
    label = code === 3 ? 'Overcast' : 'Partly cloudy';
  } else if (code === 45 || code === 48) {
    severity = 0.40;
    label = 'Fog/Mist';
  } else if (code >= 51 && code <= 55) {
    severity = 0.35;
    label = 'Drizzle';
  } else if (code === 56 || code === 57) {
    severity = 0.50;
    label = 'Freezing drizzle';
  } else if (code === 61) {
    severity = 0.35;
    label = 'Light rain';
  } else if (code === 63) {
    severity = 0.65;
    label = 'Moderate rain';
  } else if (code === 65) {
    severity = 0.90;
    label = 'Heavy rain';
  } else if (code === 66 || code === 67) {
    severity = 0.80;
    label = 'Freezing rain';
  } else if (code >= 71 && code <= 77) {
    severity = 0.80;
    label = 'Snow';
  } else if (code === 80) {
    severity = 0.40;
    label = 'Rain showers (light)';
  } else if (code === 81) {
    severity = 0.70;
    label = 'Rain showers (moderate)';
  } else if (code === 82) {
    severity = 0.90;
    label = 'Violent rain showers';
  } else if (code >= 85 && code <= 86) {
    severity = 0.80;
    label = 'Snow showers';
  } else if (code === 95) {
    severity = 0.90;
    label = 'Thunderstorm';
  } else if (code >= 96) {
    severity = 0.95;
    label = 'Thunderstorm with hail';
  }

  if (wind > 40) severity = Math.min(1.0, severity + 0.20);
  if (precip > 10) severity = Math.min(1.0, severity + 0.15);

  return {
    severity: Number(Math.max(0, Math.min(1, severity)).toFixed(2)),
    label,
    windspeed: Number(wind.toFixed(1)),
    precipitation: Number(precip.toFixed(1)),
    code
  };
}

/**
 * Deterministic local fallback generator for NER locations.
 * Provides realistic, stable regional weather conditions when live external APIs are unreachable.
 */
function getDeterministicLocalWeather(node) {
  let hash = 0;
  for (let i = 0; i < node.id.length; i++) {
    hash = ((hash << 5) - hash) + node.id.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  const isHighAltitude = ['tawang', 'gangtok', 'kohima', 'shillong'].includes(node.id);
  const isValleyOrFloodProne = ['silchar', 'tezpur', 'guwahati', 'jorhat'].includes(node.id);

  let severity = 0.10;
  let label = 'Partly cloudy';
  let temperature = 23;
  let precipitation = 0.0;
  let windspeed = 10.0;
  let code = 801;

  if (isHighAltitude) {
    severity = 0.25;
    label = 'Mountain mist';
    temperature = 14;
    windspeed = 20.0;
    precipitation = 1.2;
    code = 701;
  } else if (isValleyOrFloodProne) {
    severity = 0.18;
    label = 'Humid / Light breeze';
    temperature = 26;
    windspeed = 12.0;
    precipitation = 0.6;
    code = 802;
  } else {
    const varSeed = absHash % 10;
    severity = Number((0.08 + (varSeed * 0.015)).toFixed(2));
    temperature = 22 + (absHash % 5);
    windspeed = 8.0 + (absHash % 12);
    precipitation = (absHash % 3 === 0) ? 0.4 : 0.0;
    label = precipitation > 0 ? 'Passing clouds' : 'Clear sky';
    code = 800;
  }

  return {
    nodeId: node.id,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
    temperature,
    windspeed,
    precipitation,
    code,
    severity: Number(severity.toFixed(2)),
    label,
    source: 'local_deterministic',
    isLive: false,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Multi-Tier Resilient Weather Provider:
 *  Tier 1: OpenWeatherMap (if API key available in env)
 *  Tier 2: Open-Meteo (Keyless public forecast API)
 *  Tier 3: Deterministic Local Fallback (Guaranteed offline fallback for NER nodes)
 */
async function fetchNodeWeather(node, options = {}) {
  const key = node.id;
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && Date.now() - cached.time < CACHE_MS) {
    return cached.data;
  }

  const apiKey = process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY;

  // 1. TIER 1: OpenWeatherMap (when key exists)
  if (apiKey && !options.skipOpenWeather) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${node.lat}&lon=${node.lng}&appid=${apiKey}&units=metric`;
      const json = await fetchWithTimeout(url, 3500);
      const scored = scoreWeather(json);
      const data = {
        nodeId: node.id,
        name: node.name,
        lat: node.lat,
        lng: node.lng,
        temperature: json.main?.temp ?? null,
        windspeed: scored.windspeed,
        precipitation: scored.precipitation,
        code: scored.code,
        severity: scored.severity,
        label: scored.label,
        source: 'openweather',
        isLive: true,
        observedAt: new Date().toISOString(),
      };
      cache.set(key, { time: Date.now(), data });
      return data;
    } catch (owmErr) {
      // Gracefully fall through to Tier 2
    }
  }

  // 2. TIER 2: Open-Meteo (Keyless fallback)
  if (!options.skipOpenMeteo) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${node.lat}&longitude=${node.lng}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
      const json = await fetchWithTimeout(url, 3500);
      if (json && json.current) {
        const scored = scoreOpenMeteoWeather(json.current);
        const data = {
          nodeId: node.id,
          name: node.name,
          lat: node.lat,
          lng: node.lng,
          temperature: json.current.temperature_2m ?? null,
          windspeed: scored.windspeed,
          precipitation: scored.precipitation,
          code: scored.code,
          severity: scored.severity,
          label: scored.label,
          source: 'open_meteo',
          isLive: true,
          observedAt: new Date().toISOString(),
        };
        cache.set(key, { time: Date.now(), data });
        return data;
      }
    } catch (omErr) {
      // Gracefully fall through to Tier 3
    }
  }

  // 3. TIER 3: Deterministic Local Fallback (Always succeeds, never crashes)
  const localData = getDeterministicLocalWeather(node);
  cache.set(key, { time: Date.now(), data: localData });
  return localData;
}

// GET /api/weather/all — live weather + risk severity for every network node
router.get('/all', requireAuth, async (req, res) => {
  try {
    const results = await Promise.all(NODES.map((n) => fetchNodeWeather(n).catch(() => getDeterministicLocalWeather(n))));
    res.json({ nodes: results, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Unable to compute weather status', detail: err.message });
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
    res.status(500).json({ error: 'Unable to retrieve weather data', detail: err.message });
  }
});

module.exports = router;
module.exports.fetchNodeWeather = fetchNodeWeather;
module.exports.scoreWeather = scoreWeather;
module.exports.scoreOpenMeteoWeather = scoreOpenMeteoWeather;
module.exports.getDeterministicLocalWeather = getDeterministicLocalWeather;
module.exports.clearCache = () => cache.clear();
