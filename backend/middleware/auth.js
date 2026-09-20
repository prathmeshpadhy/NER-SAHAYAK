const jwt = require('jsonwebtoken');
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET env var is not set. Using an insecure hardcoded default — set JWT_SECRET before deploying to production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'ner-sahayak-dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this action' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
