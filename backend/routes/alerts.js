const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const alerts = await supabaseService.getAlerts(100);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts', detail: err.message });
  }
});

// field, logistics, official, and system integrations can raise alerts; drivers receive them
router.post('/', requireAuth, requireRole('field', 'logistics', 'official'), async (req, res) => {
  const { type, tone = 'amber', icon = 'bell', title, text, nodeId, road, severity = 'minor' } = req.body || {};
  if (!type || !title || !text) return res.status(400).json({ error: 'type, title and text are required' });

  try {
    const alert = await supabaseService.createAlert({
      type,
      tone,
      icon,
      title,
      text,
      nodeId: nodeId || null,
      road: road || null,
      severity,
      createdBy: req.user.id,
    });
    res.status(201).json({ alert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create alert', detail: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole('official', 'field', 'logistics'), async (req, res) => {
  try {
    const result = await supabaseService.deleteAlert(req.params.id, req.user.id, req.user.role);
    if (result.notFound) return res.status(404).json({ error: 'Alert not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to delete this alert' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert', detail: err.message });
  }
});

module.exports = router;
