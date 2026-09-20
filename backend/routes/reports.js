const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

const CATEGORIES = ['road_block', 'road_blockage', 'landslide', 'flood', 'bridge_damage', 'accident', 'traffic', 'vehicle_breakdown', 'poor_road_condition', 'weather_hazard', 'visibility_problem', 'infrastructure_damage', 'other'];
const SEVERITIES = ['minor', 'moderate', 'major', 'critical', 'low', 'medium', 'high'];

router.get('/', requireAuth, async (req, res) => {
  try {
    const reports = await supabaseService.getIncidents(200);
    res.json({ reports, categories: CATEGORIES, severities: SEVERITIES });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports', detail: err.message });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reports = await supabaseService.getIncidentsByUserId(req.user.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user reports', detail: err.message });
  }
});

// Standard create (online)
router.post('/', requireAuth, async (req, res) => {
  try {
    const report = await supabaseService.createIncident(req.user.id, req.body || {}, req.user.role || 'field');
    res.status(201).json({ report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Offline sync: client queues reports locally while offline (low-network districts)
// and POSTs the whole batch here once connectivity returns.
router.post('/sync', requireAuth, async (req, res) => {
  const { reports } = req.body || {};
  if (!Array.isArray(reports) || reports.length === 0) {
    return res.status(400).json({ error: 'reports array is required' });
  }
  const saved = [];
  const failed = [];

  for (const r of reports) {
    try {
      const savedReport = await supabaseService.createIncident(
        req.user.id,
        { ...r, synced: 1 },
        req.user.role || 'field',
        { preserveClientTimestamp: true }
      );
      saved.push(savedReport);
    } catch (err) {
      failed.push({ clientId: r.clientId, error: err.message });
    }
  }

  res.status(saved.length ? 201 : 400).json({ synced: saved.length, failed, reports: saved });
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
      comment
    );
    if (result.notFound) return res.status(404).json({ error: 'Report not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this report' });

    res.json({ report: result.report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report status', detail: err.message });
  }
});

module.exports = router;
