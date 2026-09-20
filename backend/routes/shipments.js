const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { findRoute } = require('../utils/dijkstra');
const { fetchNodeWeather } = require('./weather');
const { NODES } = require('../data/nerNetwork');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const shipments = await supabaseService.getShipments(req.user.id, req.user.role);
    res.json({ shipments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipments', detail: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { originNode, destinationNode, cargoType, priority = 'normal', vehicleId } = req.body || {};
  if (!originNode || !destinationNode) return res.status(400).json({ error: 'originNode and destinationNode are required' });

  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try { weatherSeverityByNode[n.id] = (await fetchNodeWeather(n)).severity; } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const disruptions = await supabaseService.getActiveDisruptions();
    const route = findRoute(originNode, destinationNode, { weatherSeverityByNode, disruptions });
    if (!route) return res.status(422).json({ error: 'No viable route for this shipment right now' });

    const shipment = await supabaseService.createShipment(req.user.id, {
      vehicleId: vehicleId || null,
      originNode,
      destinationNode,
      cargoType: cargoType || 'General cargo',
      priority,
      route,
    });

    res.status(201).json({ shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to plan shipment', detail: err.message });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!['planned', 'in_transit', 'delivered', 'delayed', 'cancelled', 'assigned', 'loading'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await supabaseService.updateShipmentStatus(req.params.id, req.user.id, req.user.role, status);
    if (result.notFound) return res.status(404).json({ error: 'Shipment not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this shipment' });

    res.json({ shipment: result.shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shipment status', detail: err.message });
  }
});

router.patch('/:id/assign', requireAuth, async (req, res) => {
  const { driverId } = req.body || {};
  if (!driverId) return res.status(400).json({ error: 'driverId is required' });

  try {
    const result = await supabaseService.assignDriverToShipment(req.params.id, req.user.id, req.user.role, driverId);
    if (result.notFound) return res.status(404).json({ error: 'Shipment not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to assign drivers' });

    res.json({ shipment: result.shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign driver', detail: err.message });
  }
});

module.exports = router;
