/**
 * Cloud Function to expand shortened Google Maps URLs
 * Deployed as an HTTP-triggered function
 */

const functions = require('@google-cloud/functions-framework');

// =============================================================================
// Configuration
// =============================================================================

// Allowed origins for CORS (add your production domain)
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000',
  'https://storage.googleapis.com', // GCS hosted web app
];

// Rate limiting: requests per IP per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20;     // 20 requests per minute per IP

// =============================================================================
// Rate Limiting (in-memory, per-instance)
// =============================================================================

const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore) {
      if (now - value.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  record.count++;
  return false;
}

// =============================================================================
// URL Validation (SSRF Prevention)
// =============================================================================

/**
 * Validates that a URL is a legitimate Google Maps shortened URL.
 * Prevents SSRF by checking exact domain match, not substring.
 */
function isValidGoogleMapsShortUrl(urlString) {
  try {
    const parsed = new URL(urlString);

    // Must use HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Whitelist exact domains only (prevents subdomain bypass)
    const allowedDomains = ['goo.gl', 'maps.app.goo.gl'];
    const hostname = parsed.hostname.toLowerCase();

    if (!allowedDomains.includes(hostname)) {
      return false;
    }

    // Must have a path (the short code)
    if (!parsed.pathname || parsed.pathname === '/') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that an expanded URL is a legitimate Google Maps URL.
 */
function isValidGoogleMapsUrl(urlString) {
  try {
    const parsed = new URL(urlString);

    // Must use HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Whitelist exact Google domains
    const allowedDomains = ['www.google.com', 'google.com', 'maps.google.com'];
    const hostname = parsed.hostname.toLowerCase();

    if (!allowedDomains.includes(hostname)) {
      return false;
    }

    // Must be a maps path
    if (!parsed.pathname.startsWith('/maps')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// CORS Handling
// =============================================================================

function setCorsHeaders(req, res) {
  const origin = req.get('origin') || req.get('Origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests without origin (e.g., curl, direct API calls)
    // Remove this block if you want to restrict to browser-only
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  // If origin doesn't match, no CORS header is set (browser will block)

  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
}

// =============================================================================
// Main Handler
// =============================================================================

functions.http('expandUrl', async (req, res) => {
  // Set CORS headers
  setCorsHeaders(req, res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Rate limiting
  const clientIp = req.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   req.get('x-real-ip') ||
                   req.ip ||
                   'unknown';

  if (isRateLimited(clientIp)) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  try {
    // Get URL from query parameter
    const shortUrl = req.query.url;

    if (!shortUrl) {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    // Validate URL length (prevent DoS)
    if (shortUrl.length > 500) {
      res.status(400).json({ error: 'URL too long' });
      return;
    }

    // Strict validation: must be exact Google Maps short URL domain
    if (!isValidGoogleMapsShortUrl(shortUrl)) {
      res.status(400).json({ error: 'Only Google Maps shortened URLs (goo.gl, maps.app.goo.gl) are supported' });
      return;
    }

    // Follow redirects to get the full URL
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });

    const expandedUrl = response.url;

    // Strict validation: must resolve to Google Maps
    if (!isValidGoogleMapsUrl(expandedUrl)) {
      res.status(400).json({ error: 'URL did not resolve to a valid Google Maps URL' });
      return;
    }

    res.status(200).json({ url: expandedUrl });

  } catch (error) {
    // Log minimal info (don't expose internals)
    console.error('Error expanding URL:', error.name, error.code);
    res.status(500).json({ error: 'Failed to expand URL' });
  }
});
