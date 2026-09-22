const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiter');
const { sanitizeString } = require('../middleware/security');
const { findRoute } = require('../utils/dijkstra');
const { fetchNodeWeather } = require('./weather');
const { NODES } = require('../data/nerNetwork');
const supabaseService = require('../services/supabaseService');

const router = express.Router();
const VALID_NODE_IDS = new Set(NODES.map((n) => n.id));
const VALID_STATUSES = ['planned', 'assigned', 'loading', 'in_transit', 'delayed', 'delivered', 'blocked', 'cancelled', 'pending'];

router.get('/', requireAuth, async (req, res) => {
  try {
    const shipments = await supabaseService.getShipments(req.user.id, req.user.role);
    res.json({ shipments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const shipment = await supabaseService.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    res.json({ shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipment' });
  }
});

router.get('/:id/alternative', requireAuth, async (req, res) => {
  try {
    const shipment = await supabaseService.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    res.json({
      shipmentId: shipment.id,
      originNode: shipment.originNode,
      destinationNode: shipment.destinationNode,
      isDisrupted: shipment.isDisrupted,
      accessibilityState: shipment.accessibilityState,
      alternative: shipment.recommendedAlternative || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipment alternative' });
  }
});

// Create shipment: Logistics & Official only - Rate limited
router.post('/', requireAuth, mutationLimiter, async (req, res) => {
  if (req.user.role !== 'logistics' && req.user.role !== 'official') {
    return res.status(403).json({ error: 'Only logistics operators and officials are authorized to plan cargo shipments' });
  }

  const { originNode, destinationNode, cargoType, priority = 'normal', vehicleId } = req.body || {};
  if (!originNode || !destinationNode) {
    return res.status(400).json({ error: 'originNode and destinationNode are required' });
  }

  if (!VALID_NODE_IDS.has(originNode) || !VALID_NODE_IDS.has(destinationNode)) {
    return res.status(400).json({ error: 'originNode and destinationNode must be valid NER network hubs' });
  }

  if (priority && !['normal', 'high', 'urgent', 'critical', 'emergency'].includes(priority.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid priority level' });
  }

  try {
    const weatherSeverityByNode = {};
    await Promise.all(
      NODES.map(async (n) => {
        try {
          weatherSeverityByNode[n.id] = (await fetchNodeWeather(n)).severity;
        } catch (_) {
          weatherSeverityByNode[n.id] = 0;
        }
      })
    );
    const disruptions = await supabaseService.getActiveDisruptions();
    const route = findRoute(originNode, destinationNode, { weatherSeverityByNode, disruptions });
    if (!route) return res.status(422).json({ error: 'No viable route for this shipment right now' });

    const shipment = await supabaseService.createShipment(req.user.id, {
      vehicleId: vehicleId ? sanitizeString(vehicleId, 64) : null,
      originNode,
      destinationNode,
      cargoType: cargoType ? sanitizeString(cargoType, 100) : 'General cargo',
      priority: priority.toLowerCase(),
      route,
    });

    res.status(201).json({ shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to plan shipment' });
  }
});

// Update shipment status: Logistics, Official, or Assigned Driver - Rate limited
router.patch('/:id/status', requireAuth, mutationLimiter, async (req, res) => {
  const { status } = req.body || {};
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const result = await supabaseService.updateShipmentStatus(req.params.id, req.user.id, req.user.role, status);
    if (result.notFound) return res.status(404).json({ error: 'Shipment not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this shipment' });

    res.json({ shipment: result.shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shipment status' });
  }
});

// Assign driver: Logistics & Official only - Rate limited
router.patch('/:id/assign', requireAuth, mutationLimiter, async (req, res) => {
  if (req.user.role !== 'logistics' && req.user.role !== 'official') {
    return res.status(403).json({ error: 'Only logistics operators and officials can assign drivers to shipments' });
  }

  const { driverId } = req.body || {};
  if (!driverId) return res.status(400).json({ error: 'driverId is required' });

  try {
    const result = await supabaseService.assignDriverToShipment(req.params.id, req.user.id, req.user.role, sanitizeString(driverId, 64));
    if (result.notFound) return res.status(404).json({ error: 'Shipment not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to assign drivers' });

    res.json({ shipment: result.shipment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign driver' });
  }
});

module.exports = router;
