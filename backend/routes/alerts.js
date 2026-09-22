const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiter');
const { sanitizeString, validateClientId } = require('../middleware/security');
const supabaseService = require('../services/supabaseService');

const router = express.Router();
const SEVERITIES = ['minor', 'moderate', 'major', 'critical', 'low', 'medium', 'high', 'severe', 'blocked'];

// GET /api/alerts - List all alerts
router.get('/', requireAuth, async (req, res) => {
  try {
    const alerts = await supabaseService.getAlerts(100);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/alerts/sync-responses - Batch sync offline response actions (Phase 6I)
router.post('/sync-responses', requireAuth, mutationLimiter, async (req, res) => {
  const { responses = [] } = req.body || {};
  if (!Array.isArray(responses)) {
    return res.status(400).json({ error: 'responses must be an array' });
  }
  if (responses.length > 50) {
    return res.status(400).json({ error: 'Batch exceeds maximum limit of 50 responses per sync request' });
  }

  const synced = [];
  const errors = [];

  for (const item of responses) {
    try {
      if (!item.alertId || !item.actionType) {
        errors.push({ clientId: item.clientId, error: 'Missing alertId or actionType' });
        continue;
      }

      const clientCheck = validateClientId(item.clientId);
      if (!clientCheck.valid) {
        errors.push({ clientId: item.clientId, error: clientCheck.error });
        continue;
      }

      const result = await supabaseService.recordAlertResponse(
        item.alertId,
        req.user.id,
        req.user.role,
        {
          actionType: item.actionType,
          note: item.note ? sanitizeString(item.note, 2000) : null,
          newStatus: item.newStatus,
          assignedTo: item.assignedTo ? sanitizeString(item.assignedTo, 150) : null,
          clientId: clientCheck.clientId,
          clearHazard: item.clearHazard,
          resolveIncident: item.resolveIncident,
        }
      );
      synced.push({
        clientId: item.clientId,
        serverResponseId: result.response.id,
        alertId: item.alertId,
        newStatus: result.response.newStatus,
        createdAt: result.response.createdAt,
      });
    } catch (err) {
      errors.push({ clientId: item.clientId, error: err.message });
    }
  }

  res.json({ synced, errors, count: synced.length });
});

// GET /api/alerts/:id - Retrieve single alert with allowed actions and response history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const alert = await supabaseService.getAlertById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const history = await supabaseService.getAlertResponses(req.params.id);
    const allowedActions = supabaseService.getAllowedActionsForRole(req.user.role, alert);

    let linkedIncident = null;
    if (alert.incidentId) {
      try {
        linkedIncident = await supabaseService.getIncidentById(alert.incidentId);
      } catch (_) {}
    }

    res.json({
      alert,
      incident: linkedIncident,
      responseStatus: alert.responseStatus || 'new',
      latestResponse: history.length > 0 ? history[history.length - 1] : null,
      history,
      allowedActions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert details' });
  }
});

// GET /api/alerts/:id/responses - Retrieve response history for an alert
router.get('/:id/responses', requireAuth, async (req, res) => {
  try {
    const alert = await supabaseService.getAlertById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const responses = await supabaseService.getAlertResponses(req.params.id);
    res.json({ alertId: req.params.id, responses, count: responses.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert responses' });
  }
});

// POST /api/alerts/:id/respond - Perform response action - Rate limited
router.post('/:id/respond', requireAuth, mutationLimiter, async (req, res) => {
  const { actionType, note, newStatus, assignedTo, clientId } = req.body || {};
  if (!actionType) {
    return res.status(400).json({ error: 'actionType is required' });
  }

  if (note && note.length > 2000) {
    return res.status(400).json({ error: 'Note exceeds maximum character limit of 2000' });
  }

  const clientCheck = validateClientId(clientId);
  if (!clientCheck.valid) {
    return res.status(400).json({ error: clientCheck.error });
  }

  try {
    const result = await supabaseService.recordAlertResponse(
      req.params.id,
      req.user.id,
      req.user.role,
      {
        actionType,
        note: note ? sanitizeString(note, 2000) : null,
        newStatus,
        assignedTo: assignedTo ? sanitizeString(assignedTo, 150) : null,
        clientId: clientCheck.clientId,
        clearHazard: req.body ? req.body.clearHazard : undefined,
        resolveIncident: req.body ? req.body.resolveIncident : undefined,
      }
    );

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PATCH /api/alerts/:id/status - Quick status update - Rate limited
router.patch('/:id/status', requireAuth, mutationLimiter, async (req, res) => {
  const { status, note } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status is required' });

  try {
    const result = await supabaseService.recordAlertResponse(
      req.params.id,
      req.user.id,
      req.user.role,
      {
        actionType: 'UPDATE_STATUS',
        newStatus: status,
        note: note ? sanitizeString(note, 2000) : null,
      }
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/alerts - Create alert (field, logistics, official only) - Rate limited
router.post('/', requireAuth, requireRole('field', 'logistics', 'official'), mutationLimiter, async (req, res) => {
  const { type, tone = 'amber', icon = 'bell', title, text, nodeId, road, severity = 'minor', incidentId } = req.body || {};
  if (!type || !title || !text) return res.status(400).json({ error: 'type, title and text are required' });

  if (severity && !SEVERITIES.includes(severity.toLowerCase())) {
    return res.status(400).json({ error: `Invalid severity "${severity}". Must be one of: ${SEVERITIES.join(', ')}` });
  }

  try {
    const alert = await supabaseService.createAlert({
      type: sanitizeString(type, 50),
      tone: tone ? sanitizeString(tone, 20) : 'amber',
      icon: icon ? sanitizeString(icon, 30) : 'bell',
      title: sanitizeString(title, 200),
      text: sanitizeString(text, 2000),
      nodeId: nodeId ? sanitizeString(nodeId, 50) : null,
      road: road ? sanitizeString(road, 50) : null,
      severity: severity.toLowerCase(),
      createdBy: req.user.id,
      incidentId: incidentId ? sanitizeString(incidentId, 64) : null,
      responseStatus: 'new',
    });
    res.status(201).json({ alert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// DELETE /api/alerts/:id - Delete alert (official, or creator for field/logistics)
router.delete('/:id', requireAuth, requireRole('official', 'field', 'logistics'), async (req, res) => {
  try {
    const result = await supabaseService.deleteAlert(req.params.id, req.user.id, req.user.role);
    if (result.notFound) return res.status(404).json({ error: 'Alert not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to delete this alert' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

module.exports = router;
