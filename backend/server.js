require('dotenv').config();
const express = require('express');
const cors = require('cors');

const db = require('./db'); // initializes + seeds SQLite on first run

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

app.use(cors());
app.use(express.json({ limit: '8mb' })); // generous limit for geo-tagged photo uploads (base64)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ner-sahayak-backend', time: new Date().toISOString() });
});

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

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`NER-Sahayak backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;

