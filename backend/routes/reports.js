const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiter');
const {
  validateCoordinates,
  validatePhotoPayload,
  validateClientId,
  sanitizeString,
} = require('../middleware/security');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

const CATEGORIES = [
  'road_block',
  'road_blockage',
  'landslide',
  'flood',
  'bridge_damage',
  'accident',
  'traffic',
  'vehicle_breakdown',
  'poor_road_condition',
  'weather_hazard',
  'visibility_problem',
  'infrastructure_damage',
  'other',
];

const SEVERITIES = ['minor', 'moderate', 'major', 'critical', 'low', 'medium', 'high'];

router.get('/', requireAuth, async (req, res) => {
  try {
    const reports = await supabaseService.getIncidents(200);
    res.json({ reports, categories: CATEGORIES, severities: SEVERITIES });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reports = await supabaseService.getIncidentsByUserId(req.user.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user reports' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const report = await supabaseService.getIncidentById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Incident report not found' });
    }
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incident report' });
  }
});

// Standard create (online) - Rate limited
router.post('/', requireAuth, mutationLimiter, async (req, res) => {
  const body = req.body || {};

  // 1. Coordinates validation
  const coordCheck = validateCoordinates(body.lat, body.lng, { required: false });
  if (!coordCheck.valid) {
    return res.status(400).json({ error: coordCheck.error });
  }

  // 2. Photo payload validation
  const photoCheck = validatePhotoPayload(body.photoDataUrl || body.photoUrl);
  if (!photoCheck.valid) {
    return res.status(400).json({ error: photoCheck.error });
  }

  // 3. ClientId validation
  const clientCheck = validateClientId(body.clientId);
  if (!clientCheck.valid) {
    return res.status(400).json({ error: clientCheck.error });
  }

  // 4. Category & Severity Enum validation
  if (body.category && !CATEGORIES.includes(body.category)) {
    return res.status(400).json({ error: `Invalid category "${body.category}". Must be one of: ${CATEGORIES.join(', ')}` });
  }
  if (body.severity && !SEVERITIES.includes(body.severity)) {
    return res.status(400).json({ error: `Invalid severity "${body.severity}". Must be one of: ${SEVERITIES.join(', ')}` });
  }

  try {
    const sanitizedBody = {
      ...body,
      title: sanitizeString(body.title, 200),
      description: sanitizeString(body.description, 2000),
      road: body.road ? sanitizeString(body.road, 100) : null,
      lat: coordCheck.lat,
      lng: coordCheck.lng,
      photoDataUrl: photoCheck.photo,
      clientId: clientCheck.clientId,
    };

    const report = await supabaseService.createIncident(req.user.id, sanitizedBody, req.user.role || 'field');
    res.status(201).json({ report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Offline sync batch - Rate limited
router.post('/sync', requireAuth, mutationLimiter, async (req, res) => {
  const { reports } = req.body || {};
  if (!Array.isArray(reports) || reports.length === 0) {
    return res.status(400).json({ error: 'reports array is required' });
  }
  if (reports.length > 50) {
    return res.status(400).json({ error: 'Batch sync exceeds maximum limit of 50 reports per request' });
  }

  const saved = [];
  const failed = [];

  for (const r of reports) {
    try {
      const coordCheck = validateCoordinates(r.lat, r.lng, { required: false });
      if (!coordCheck.valid) {
        failed.push({ clientId: r.clientId || null, error: coordCheck.error, retryable: false });
        continue;
      }

      const photoCheck = validatePhotoPayload(r.photoDataUrl || r.photoUrl);
      if (!photoCheck.valid) {
        failed.push({ clientId: r.clientId || null, error: photoCheck.error, retryable: false });
        continue;
      }

      const clientCheck = validateClientId(r.clientId);
      if (!clientCheck.valid) {
        failed.push({ clientId: r.clientId || null, error: clientCheck.error, retryable: false });
        continue;
      }

      if (r.category && !CATEGORIES.includes(r.category)) {
        failed.push({ clientId: r.clientId || null, error: `Invalid category "${r.category}"`, retryable: false });
        continue;
      }

      const sanitized = {
        ...r,
        title: sanitizeString(r.title, 200),
        description: sanitizeString(r.description, 2000),
        road: r.road ? sanitizeString(r.road, 100) : null,
        lat: coordCheck.lat,
        lng: coordCheck.lng,
        photoDataUrl: photoCheck.photo,
        clientId: clientCheck.clientId,
        synced: 1,
      };

      const savedReport = await supabaseService.createIncident(
        req.user.id,
        sanitized,
        req.user.role || 'field',
        { preserveClientTimestamp: true }
      );

      saved.push({
        ...savedReport,
        clientId: r.clientId || savedReport.clientId || null,
        serverIncidentId: savedReport.id,
      });
    } catch (err) {
      failed.push({
        clientId: r.clientId || null,
        error: err.message,
        retryable: !err.message.includes('Invalid') && !err.message.includes('required'),
      });
    }
  }

  const statusCode = saved.length > 0 ? 201 : 200;
  res.status(statusCode).json({ synced: saved.length, failed, reports: saved });
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status, comment } = req.body || {};
  if (!['open', 'in_progress', 'resolved', 'active', 'verified', 'under_review'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await supabaseService.updateIncidentStatus(
      req.params.id,
      status,
      req.user.id,
      req.user.role,
      sanitizeString(comment, 1000)
    );
    if (result.notFound) return res.status(404).json({ error: 'Report not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this report' });

    res.json({ report: result.report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report status' });
  }
});

module.exports = router;
