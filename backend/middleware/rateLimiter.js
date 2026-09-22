/**
 * NER-SAHAYAK — In-Memory Sliding-Window Rate Limiter
 *
 * NOTE ON ARCHITECTURE:
 * This rate limiter uses a process-local in-memory sliding window cache.
 * It is suited for this hackathon / single-node container deployment without
 * introducing external Redis or distributed cache dependencies.
 * In a multi-instance distributed cluster, a shared token-bucket store (e.g. Redis)
 * would be recommended.
 */

function createRateLimiter({
  windowMs = 60 * 1000,
  max = 60,
  message = 'Too many requests. Please wait and try again.',
  skip = () => false,
} = {}) {
  const hits = new Map();

  // Periodic cleanup of stale IPs every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, active);
      }
    }
  }, 5 * 60 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref(); // Prevent timer from keeping test processes alive
  }

  const limiter = (req, res, next) => {
    if (skip(req)) return next();

    let clientIp = '127.0.0.1';
    try {
      if (req.headers && req.headers['x-forwarded-for']) {
        clientIp = req.headers['x-forwarded-for'].split(',')[0].trim();
      } else if (req.socket && req.socket.remoteAddress) {
        clientIp = req.socket.remoteAddress;
      } else if (req.connection && req.connection.remoteAddress) {
        clientIp = req.connection.remoteAddress;
      }
    } catch (_) {
      clientIp = '127.0.0.1';
    }

    const now = Date.now();
    const timestamps = hits.get(clientIp) || [];
    const windowStart = now - windowMs;
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= max) {
      const oldest = validTimestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((oldest + windowMs) / 1000)));

      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds,
      });
    }

    validTimestamps.push(now);
    hits.set(clientIp, validTimestamps);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - validTimestamps.length)));
    next();
  };

  limiter.reset = () => hits.clear();
  return limiter;
}

// Pre-configured limiters:
// Auth limiter: 25 requests per 15 minutes window for login & signup
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many authentication attempts. Please wait a few minutes before retrying.',
});

// Mutation limiter: 80 sensitive mutations per minute
const mutationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 80,
  message: 'Request rate threshold reached. Please allow network operations to settle.',
});

module.exports = {
  createRateLimiter,
  authLimiter,
  mutationLimiter,
};
