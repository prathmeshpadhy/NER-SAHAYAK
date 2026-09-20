const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const ownerId = req.user.role === 'driver' ? req.user.id : null;
    const vehicles = await supabaseService.getVehicles(ownerId);
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vehicles', detail: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { vehicleNumber, cargoType, originNode, destinationNode, lat, lng } = req.body || {};
  if (!vehicleNumber || !originNode || !destinationNode) {
    return res.status(400).json({ error: 'vehicleNumber, originNode and destinationNode are required' });
  }

  try {
    const vehicle = await supabaseService.createVehicle(req.user.id, {
      vehicleNumber,
      cargoType,
      originNode,
      destinationNode,
      lat,
      lng,
    });
    res.status(201).json({ vehicle });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create vehicle', detail: err.message });
  }
});

// GPS ping — called periodically by the driver's device/app to update live location
router.post('/:id/ping', requireAuth, async (req, res) => {
  const { lat, lng, status } = req.body || {};
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng are required' });

  try {
    const result = await supabaseService.updateVehicleLocation(
      req.params.id,
      req.user.id,
      req.user.role,
      { lat, lng, status }
    );
    if (result.notFound) return res.status(404).json({ error: 'Vehicle not found' });
    if (result.forbidden) return res.status(403).json({ error: 'You do not have permission to update this vehicle' });

    res.json({ vehicle: result.vehicle });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vehicle location', detail: err.message });
  }
});

module.exports = router;
