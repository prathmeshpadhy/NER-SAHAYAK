const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

function toPublicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

// GET /api/users — directory of every registered account (Official/Admin only)
router.get('/', requireAuth, requireRole('official'), async (req, res) => {
  try {
    const { role, state, search } = req.query;
    const { users, total, byRole } = await supabaseService.listUsers({ role, state, search });
    res.json({ users: users.map(toPublicUser), total, byRole });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users', detail: err.message });
  }
});

// GET /api/users/:id — full detail on one account (official only)
router.get('/:id', requireAuth, requireRole('official'), async (req, res) => {
  try {
    const user = await supabaseService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user', detail: err.message });
  }
});

// PATCH /api/users/:id — update user details (Official/Admin only)
router.patch('/:id', requireAuth, requireRole('official'), async (req, res) => {
  const allowed = ['name', 'phone', 'role', 'organisation', 'vehicleNumber', 'state', 'district', 'language', 'hub', 'department'];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });
  if (updates.role && !['driver', 'field', 'logistics', 'official'].includes(updates.role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const existing = await supabaseService.getUserById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const updated = await supabaseService.updateUser(req.params.id, updates);
    res.json({ user: toPublicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', detail: err.message });
  }
});

// DELETE /api/users/:id — delete a user account (Official/Admin only)
router.delete('/:id', requireAuth, requireRole('official'), async (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ error: 'You cannot delete your own account from the directory.' });
  }

  try {
    const existing = await supabaseService.getUserById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await supabaseService.deleteUser(req.params.id);
    res.json({ ok: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', detail: err.message });
  }
});

module.exports = router;
