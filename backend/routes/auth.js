const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

function toPublicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const user = await supabaseService.getUserByEmail(email);
    if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    const token = sign(user);
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

router.post('/signup', async (req, res) => {
  const body = req.body || {};
  const required = ['name', 'email', 'password', 'organisation', 'district', 'role'];
  for (const field of required) {
    if (!body[field]) return res.status(400).json({ error: `${field} is required` });
  }
  if (!['driver', 'field', 'logistics', 'official'].includes(body.role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (body.password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const email = String(body.email).toLowerCase().trim();
  try {
    const exists = await supabaseService.getUserByEmail(email);
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = {
      id: uuid(),
      name: body.name,
      email,
      passwordHash: bcrypt.hashSync(body.password, 8),
      phone: body.phone || null,
      role: body.role,
      organisation: body.organisation,
      vehicleNumber: body.vehicleNumber || null,
      state: body.state || null,
      district: body.district,
      language: body.language || 'en',
      hub: body.hub || null,
      department: body.department || null,
      createdAt: new Date().toISOString(),
    };

    const created = await supabaseService.createUser(user);
    const token = sign(created);
    res.status(201).json({ token, user: toPublicUser(created) });
  } catch (err) {
    res.status(500).json({ error: 'Signup failed', detail: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await supabaseService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile', detail: err.message });
  }
});

router.patch('/me', requireAuth, async (req, res) => {
  const allowed = ['name', 'phone', 'organisation', 'vehicleNumber', 'state', 'district', 'language', 'hub', 'department'];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    const updated = await supabaseService.updateUser(req.user.id, updates);
    res.json({ user: toPublicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', detail: err.message });
  }
});

module.exports = router;
