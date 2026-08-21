/**
 * Public read of the sanitized charging-stats snapshot.
 * Prefer Netlify Blobs; fall back to static JSON so the page stays up
 * until the first successful sync (never a bare 500 on empty/misconfigured Blobs).
 * No secrets. Same-origin CORS is enough.
 */
const fs = require('fs');
const path = require('path');
const { getSnapshot, jsonResponse } = require('./_lib/tesla');

const CORS = {
  'Access-Control-Allow-Origin': 'https://silentwanderers.com',
};

function loadStaticFallback() {
  // Prefer esbuild-bundled require (works on Git-connected Netlify deploys).
  try {
    return require('../../static/data/charging-stats.json');
  } catch (_) {
    /* continue */
  }

  // included_files copies preserve repo-relative paths in some runtimes.
  const candidates = [
    path.join(__dirname, '../../static/data/charging-stats.json'),
    path.join(process.cwd(), 'static/data/charging-stats.json'),
    path.join(__dirname, 'static/data/charging-stats.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

function hasPlottablePins(snapshot) {
  const sites = snapshot && Array.isArray(snapshot.sites) ? snapshot.sites : [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    if (
      s &&
      typeof s.lat === 'number' &&
      Number.isFinite(s.lat) &&
      typeof s.lng === 'number' &&
      Number.isFinite(s.lng)
    ) {
      return true;
    }
  }
  return false;
}

/** Live Blobs: short TTL when pins exist; never park a zero-pin body on the CDN. */
function liveCacheControl(snapshot) {
  return hasPlottablePins(snapshot) ? 'public, max-age=60' : 'no-store';
}

function okSnapshot(snapshot, cacheControl) {
  return jsonResponse(200, snapshot, {
    ...CORS,
    'Cache-Control': cacheControl,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' }, CORS);
  }

  try {
    const snapshot = await getSnapshot(event);
    if (snapshot) {
      return okSnapshot(snapshot, liveCacheControl(snapshot));
    }
  } catch (_) {
    // Blobs misconfigured / bundling failure — fall through to static
  }

  const fallback = loadStaticFallback();
  if (fallback) {
    // Shorter cache so a later live sync is picked up promptly
    return okSnapshot(fallback, 'public, max-age=60');
  }

  return jsonResponse(503, { error: 'No snapshot available' }, CORS);
};
