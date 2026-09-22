const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { mutationLimiter } = require('../middleware/rateLimiter');
const { validateCoordinates, sanitizeString } = require('../middleware/security');
const { NODES } = require('../data/nerNetwork');
const supabaseService = require('../services/supabaseService');

const router = express.Router();
const VALID_NODE_IDS = new Set(NODES.map((n) => n.id));

router.get('/', requireAuth, async (req, res) => {
  try {
    const ownerId = req.user.role === 'driver' ? req.user.id : null;
    const rawVehicles = await supabaseService.getVehicles(ownerId);
    const rawShipments = await supabaseService.getShipments();
    const { enrichVehicles } = require('../utils/shipmentIntelligence');
    const vehicles = enrichVehicles(rawVehicles, rawShipments);
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const rawVehicles = await supabaseService.getVehicles();
    const rawShipments = await supabaseService.getShipments();
    const { enrichVehicles } = require('../utils/shipmentIntelligence');
    const vehicles = enrichVehicles(rawVehicles, rawShipments);
    const vehicle = vehicles.find((v) => v.id === req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ vehicle });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

router.post('/', requireAuth, mutationLimiter, async (req, res) => {
  // Authorization: Only logistics, official, or driver registering their assigned vehicle
  if (req.user.role === 'field') {
    return res.status(403).json({ error: 'Field officers are not authorized to register transport vehicles' });
  }

  const { vehicleNumber, cargoType, originNode, destinationNode, lat, lng, capacityTonnes, vehicleType } = req.body || {};
  if (!vehicleNumber || !originNode || !destinationNode) {
    return res.status(400).json({ error: 'vehicleNumber, originNode and destinationNode are required' });
  }

  if (!VALID_NODE_IDS.has(originNode) || !VALID_NODE_IDS.has(destinationNode)) {
    return res.status(400).json({ error: 'originNode and destinationNode must be valid NER network hubs' });
  }

  const coordCheck = validateCoordinates(lat, lng, { required: false });
  if (!coordCheck.valid) {
    return res.status(400).json({ error: coordCheck.error });
  }

  try {
    const vehicle = await supabaseService.createVehicle(req.user.id, {
      vehicleNumber: sanitizeString(vehicleNumber, 50),
      cargoType: cargoType ? sanitizeString(cargoType, 100) : 'General cargo',
      vehicleType: vehicleType ? sanitizeString(vehicleType, 50) : 'Heavy Truck',
      capacityTonnes: Number(capacityTonnes) || 16.0,
      originNode,
      destinationNode,
      driverId: req.user.role === 'driver' ? req.user.id : (req.body.driverId || null),
      lat: coordCheck.lat,
      lng: coordCheck.lng,
    });
    res.status(201).json({ vehicle });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

// GPS telemetry ping — called periodically by vehicle/driver device
router.post('/:id/ping', requireAuth, mutationLimiter, async (req, res) => {
  if (req.user.role === 'field') {
    return res.status(403).json({ error: 'Field officers are not authorized to update vehicle telemetry' });
  }

  const { lat, lng, status } = req.body || {};
  const coordCheck = validateCoordinates(lat, lng, { required: true });
  if (!coordCheck.valid) {
    return res.status(400).json({ error: coordCheck.error });
  }

  if (status && !['in_transit', 'idle', 'delayed', 'loading', 'delivered', 'maintenance'].includes(status)) {
    return res.status(400).json({ error: 'Invalid vehicle status value' });
  }

  try {
    const result = await supabaseService.updateVehicleLocation(
      req.params.id,
      req.user.id,
      req.user.role,
      { lat: coordCheck.lat, lng: coordCheck.lng, status }
    );
    if (result.notFound) return res.status(404).json({ error: 'Vehicle not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this vehicle' });

    res.json({ vehicle: result.vehicle });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vehicle location' });
  }
});

module.exports = router;
