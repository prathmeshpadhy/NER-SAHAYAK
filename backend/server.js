require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const db = require('./db'); // initializes + seeds SQLite on first run
const { securityHeaders } = require('./middleware/security');

const authRoutes = require('./routes/auth');
const networkRoutes = require('./routes/network');
const weatherRoutes = require('./routes/weather');
const alertRoutes = require('./routes/alerts');
const reportRoutes = require('./routes/reports');
const vehicleRoutes = require('./routes/vehicles');
const shipmentRoutes = require('./routes/shipments');
const dashboardRoutes = require('./routes/dashboard');
const i18nRoutes = require('./routes/i18n');
const userRoutes = require('./routes/users');
const askRoutes = require('./routes/ask');

const app = express();
const PORT = process.env.PORT || 4000;

// 1. Production Security Headers
app.use(securityHeaders);

// 2. Controlled CORS Configuration
const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'https://ner-sahayak.onrender.com',
];
const configuredOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      (!process.env.NODE_ENV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    ) {
      return callback(null, true);
    }
    return callback(new Error('Origin not permitted by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// 3. Request Body Parsing (8mb for base64 geo-tagged incident photos)
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Health & System Reliability Check (Lightweight, No Secrets Exposed)
app.get('/api/health', (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const row = db.prepare('SELECT 1 as alive').get();
    if (row && row.alive === 1) dbStatus = 'connected';
  } catch (_) {
    dbStatus = 'error';
  }

  const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasWeatherKey = Boolean(process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY);
  const hasVapid = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const hasAiKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

  const healthy = dbStatus === 'connected';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'ner-sahayak-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      type: 'sqlite',
      status: dbStatus,
    },
    services: {
      supabase: hasSupabase ? 'configured' : 'fallback_sqlite',
      weather: hasWeatherKey ? 'openweather_live' : 'open_meteo_fallback',
      webPush: hasVapid ? 'configured' : 'in_app_fallback',
      aiEngine: hasAiKey ? 'external_api' : 'local_rule_engine',
    },
  });
});

// 5. Application API Routes
app.use('/api/auth', authRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ask', askRoutes);
app.use('/api/chat', askRoutes);
app.use('/ask', askRoutes);

// 6. API 404 Guard (Guarantees unknown /api requests return JSON 404, never index.html)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API endpoint ${req.method} ${req.path} not found`,
  });
});

// 7. Static Asset Serving & React SPA Routing
const frontendBuildPath = path.join(__dirname, '../frontend/build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(404).json({ error: 'Frontend build not found. Please build the frontend.' });
  });
}

// 8. Final Fallback for unhandled non-GET requests
app.all('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 7. Centralized Error Handler (Stack traces & SQL errors sanitized)
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Payload too large. Attached files or data must be within size limits.' });
  }

  if (err.message === 'Origin not permitted by CORS policy') {
    return res.status(403).json({ error: 'Origin not permitted by CORS policy' });
  }

  const statusCode = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = statusCode < 500 ? err.message : isProd ? 'Internal server error' : (err.message || 'Internal server error');

  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
  });
});

// 8. Server Lifecycle & Graceful Shutdown
let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`NER-Sahayak backend listening on http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    if (server) {
      server.close(() => {
        try { db.close(); } catch (_) {}
        console.log('HTTP server and database connection closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
