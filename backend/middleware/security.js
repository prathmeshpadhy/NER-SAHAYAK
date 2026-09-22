/**
 * NER-SAHAYAK — Production Security Middleware & Validation Helpers
 * Provides HTTP security headers, input sanitization, coordinate validation,
 * and payload integrity checks without external overhead.
 */

/**
 * Injects standard security headers on every response.
 * Carefully avoids restrictive CSP directives that would break Leaflet map tiles,
 * Web Push service workers, or React inline styles.
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self)');

  const isSecure = Boolean(req.socket && req.socket.encrypted) || Boolean(req.headers && req.headers['x-forwarded-proto'] === 'https');
  if (process.env.NODE_ENV === 'production' || isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Safe Content-Security-Policy supporting Leaflet tiles, inline styles, and map data
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' ws: wss:; " +
    "font-src 'self' data:; " +
    "worker-src 'self' blob:; " +
    "frame-ancestors 'self';"
  );

  next();
}

/**
 * Validates geographical coordinates.
 * Accepts null/undefined if location is optional (e.g. report without GPS).
 * When coordinates are provided, strictly enforces:
 *  - Numeric types (not NaN, not strings that fail parsing)
 *  - Latitude: -90.0 <= lat <= 90.0
 *  - Longitude: -180.0 <= lng <= 180.0
 */
function validateCoordinates(lat, lng, { required = false } = {}) {
  const hasLat = lat !== undefined && lat !== null && lat !== '';
  const hasLng = lng !== undefined && lng !== null && lng !== '';

  if (!hasLat && !hasLng) {
    if (required) {
      return { valid: false, error: 'Latitude and longitude coordinates are required.' };
    }
    return { valid: true, lat: null, lng: null };
  }

  if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
    return { valid: false, error: 'Both latitude and longitude must be provided together.' };
  }

  const numLat = Number(lat);
  const numLng = Number(lng);

  if (isNaN(numLat) || !isFinite(numLat)) {
    return { valid: false, error: `Invalid latitude value "${lat}". Must be a valid numeric value.` };
  }
  if (isNaN(numLng) || !isFinite(numLng)) {
    return { valid: false, error: `Invalid longitude value "${lng}". Must be a valid numeric value.` };
  }

  if (numLat < -90 || numLat > 90) {
    return { valid: false, error: `Latitude ${numLat} out of bounds. Must be between -90.0 and 90.0 degrees.` };
  }
  if (numLng < -180 || numLng > 180) {
    return { valid: false, error: `Longitude ${numLng} out of bounds. Must be between -180.0 and 180.0 degrees.` };
  }

  return { valid: true, lat: numLat, lng: numLng };
}

/**
 * Sanitizes string inputs to prevent path traversal and control character pollution.
 */
function sanitizeString(val, maxLen = 2000) {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') val = String(val);
  return val
    .replace(/\0/g, '') // remove null bytes
    .replace(/\.\.\//g, '') // strip directory traversal tokens
    .replace(/\.\.\\/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Validates attached photo payload format and size.
 * Allows base64 data URLs (jpeg, png, webp) or standard HTTP(S) image URLs.
 */
function validatePhotoPayload(photoDataUrl) {
  if (!photoDataUrl || typeof photoDataUrl !== 'string') {
    return { valid: true, photo: null };
  }

  const trimmed = photoDataUrl.trim();
  if (trimmed.length === 0) {
    return { valid: true, photo: null };
  }

  // Max raw payload size: 8 MB base64 string
  if (trimmed.length > 8 * 1024 * 1024) {
    return { valid: false, error: 'Attached photo payload exceeds maximum allowed size of 8 MB.' };
  }

  const isDataImage = /^data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,/i.test(trimmed);
  const isHttpUrl = /^https?:\/\/.+/i.test(trimmed);
  const isLocalPath = /^\/images\/.+/i.test(trimmed);

  if (!isDataImage && !isHttpUrl && !isLocalPath) {
    return {
      valid: false,
      error: 'Invalid image format. Attached photos must be valid base64 image Data URLs (JPEG, PNG, WebP) or image URLs.',
    };
  }

  return { valid: true, photo: trimmed };
}

/**
 * Validates clientId format for offline queue synchronization.
 * Stable, sanitized identifier up to 128 characters.
 */
function validateClientId(clientId) {
  if (!clientId) return { valid: true, clientId: null };
  if (typeof clientId !== 'string') {
    return { valid: false, error: 'clientId must be a string identifier.' };
  }
  const clean = clientId.trim();
  if (clean.length === 0 || clean.length > 128) {
    return { valid: false, error: 'clientId must be between 1 and 128 characters.' };
  }
  // Disallow path traversal characters in clientId
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\')) {
    return { valid: false, error: 'clientId contains invalid characters.' };
  }
  return { valid: true, clientId: clean };
}

module.exports = {
  securityHeaders,
  validateCoordinates,
  sanitizeString,
  validatePhotoPayload,
  validateClientId,
};
