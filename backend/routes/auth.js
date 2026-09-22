const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { sanitizeString } = require('../middleware/security');
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

// POST /api/auth/login - Rate limited
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const cleanEmail = String(email).toLowerCase().trim();
  if (cleanEmail.length > 150 || typeof password !== 'string' || password.length > 256) {
    return res.status(400).json({ error: 'Invalid email or password format' });
  }

  try {
    const user = await supabaseService.getUserByEmail(cleanEmail);
    if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    const token = sign(user);
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again later.' });
  }
});

// POST /api/auth/signup - Rate limited
router.post('/signup', authLimiter, async (req, res) => {
  const body = req.body || {};
  const required = ['name', 'email', 'password', 'organisation', 'district', 'role'];
  for (const field of required) {
    if (!body[field]) return res.status(400).json({ error: `${field} is required` });
  }
  if (!['driver', 'field', 'logistics', 'official'].includes(body.role)) {
    return res.status(400).json({ error: 'Invalid role. Must be driver, field, logistics, or official' });
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (body.password.length > 256) {
    return res.status(400).json({ error: 'Password exceeds maximum length limit' });
  }

  const email = String(body.email).toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email) || email.length > 150) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }

  try {
    const exists = await supabaseService.getUserByEmail(email);
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = {
      id: uuid(),
      name: sanitizeString(body.name, 100),
      email,
      passwordHash: bcrypt.hashSync(body.password, 8),
      phone: body.phone ? sanitizeString(body.phone, 30) : null,
      role: body.role,
      organisation: sanitizeString(body.organisation, 150),
      vehicleNumber: body.vehicleNumber ? sanitizeString(body.vehicleNumber, 50) : null,
      state: body.state ? sanitizeString(body.state, 50) : null,
      district: sanitizeString(body.district, 50),
      language: body.language || 'en',
      hub: body.hub ? sanitizeString(body.hub, 100) : null,
      department: body.department ? sanitizeString(body.department, 100) : null,
      createdAt: new Date().toISOString(),
    };

    const created = await supabaseService.createUser(user);
    const token = sign(created);
    res.status(201).json({ token, user: toPublicUser(created) });
  } catch (err) {
    console.error('[Auth] Signup error:', err.message);
    res.status(500).json({ error: 'Signup failed. Please try again later.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await supabaseService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PATCH /api/auth/me
router.patch('/me', requireAuth, async (req, res) => {
  const allowed = ['name', 'phone', 'organisation', 'vehicleNumber', 'state', 'district', 'language', 'hub', 'department'];
  const updates = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) {
      updates[k] = sanitizeString(req.body[k], 150);
    }
  });
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    const updated = await supabaseService.updateUser(req.user.id, updates);
    res.json({ user: toPublicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
