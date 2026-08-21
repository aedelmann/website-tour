/**
 * Shared Tesla Fleet API helpers for Silent Wanderers.
 * Official Fleet API only (EU). Never log tokens.
 */

const { connectLambda, getStore } = require('@netlify/blobs');

const DEFAULT_FLEET_BASE = 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
/** Token exchange must use fleet-auth (server-side rate limits). */
const AUTH_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
/**
 * User authorize host per Tesla third-party token docs.
 * @see https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens
 */
const AUTH_AUTHORIZE_HOST = 'https://auth.tesla.com';
const AUTH_AUTHORIZE_URL = `${AUTH_AUTHORIZE_HOST}/oauth2/v3/authorize`;
const REDIRECT_URI = 'https://silentwanderers.com/.netlify/functions/tesla-oauth-callback';
const DOMAIN = 'silentwanderers.com';
const SCOPES = 'openid offline_access vehicle_device_data vehicle_charging_cmds energy_device_data';

const BLOB_STORE = 'tesla';
const KEY_REFRESH = 'refresh_token';
const KEY_SNAPSHOT = 'charging-stats';

function fleetBase() {
  return (process.env.TESLA_FLEET_BASE || DEFAULT_FLEET_BASE).replace(/\/$/, '');
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) {
    const err = new Error(`Missing env ${name}`);
    err.code = 'MISSING_ENV';
    throw err;
  }
  return v;
}

/**
 * Functions v1 / Lambda compatibility does not auto-inject NETLIFY_BLOBS_CONTEXT.
 * Call connectLambda(event) immediately before getStore (inside the request handler).
 * Use default (eventual) consistency — strong needs uncachedEdgeURL, which connectLambda
 * does not inject on Functions v1. Fine for OAuth tokens and a ~6h Charge Stats snapshot.
 */
function teslaStore(event) {
  connectLambda(event);
  return getStore({ name: BLOB_STORE });
}

function jsonResponse(status, body, extraHeaders) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

function htmlResponse(status, html) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: html,
  };
}

function setupSecretOk(event) {
  const expected = process.env.TESLA_SETUP_SECRET;
  if (!expected) return false;
  const q = event.queryStringParameters || {};
  const header =
    (event.headers && (event.headers['x-tesla-setup-secret'] || event.headers['X-Tesla-Setup-Secret'])) ||
    '';
  return q.secret === expected || header === expected;
}

async function formTokenRequest(params) {
  const body = new URLSearchParams(params);
  const res = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: 'invalid_json', raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
    err.status = res.status;
    err.code = 'TOKEN_ERROR';
    // Safe Tesla OAuth error fields only — never attach tokens or secrets.
    err.teslaError = typeof data.error === 'string' ? data.error : null;
    err.teslaErrorDescription =
      typeof data.error_description === 'string' ? data.error_description : null;
    throw err;
  }
  return data;
}

async function exchangeAuthorizationCode(code) {
  return formTokenRequest({
    grant_type: 'authorization_code',
    client_id: requiredEnv('TESLA_CLIENT_ID'),
    client_secret: requiredEnv('TESLA_CLIENT_SECRET'),
    code,
    redirect_uri: REDIRECT_URI,
    audience: fleetBase(),
  });
}

async function refreshAccessToken(refreshToken) {
  return formTokenRequest({
    grant_type: 'refresh_token',
    client_id: requiredEnv('TESLA_CLIENT_ID'),
    client_secret: requiredEnv('TESLA_CLIENT_SECRET'),
    refresh_token: refreshToken,
  });
}

async function partnerAccessToken() {
  return formTokenRequest({
    grant_type: 'client_credentials',
    client_id: requiredEnv('TESLA_CLIENT_ID'),
    client_secret: requiredEnv('TESLA_CLIENT_SECRET'),
    audience: fleetBase(),
    scope: SCOPES,
  });
}

async function getRefreshToken(event) {
  const store = teslaStore(event);
  return store.get(KEY_REFRESH);
}

async function setRefreshToken(event, token) {
  if (!token) return;
  const store = teslaStore(event);
  await store.set(KEY_REFRESH, token);
}

async function getSnapshot(event) {
  const store = teslaStore(event);
  const raw = await store.get(KEY_SNAPSHOT, { type: 'text' });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setSnapshot(event, snapshot) {
  const store = teslaStore(event);
  await store.set(KEY_SNAPSHOT, JSON.stringify(snapshot));
}

/**
 * Persist a new refresh token whenever Tesla returns one (each refresh invalidates the prior).
 */
async function persistTokensFromResponse(event, tokenResponse) {
  if (tokenResponse && tokenResponse.refresh_token) {
    await setRefreshToken(event, tokenResponse.refresh_token);
  }
}

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: requiredEnv('TESLA_CLIENT_ID'),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state: state || 'sw',
  });
  return `${AUTH_AUTHORIZE_URL}?${params.toString()}`;
}

function pickSessions(payload) {
  if (!payload) return { sessions: [], next: null };
  const r = payload.response ?? payload.data ?? payload;
  let sessions = [];
  if (Array.isArray(payload)) sessions = payload;
  else if (Array.isArray(r)) sessions = r;
  else if (Array.isArray(r?.data)) sessions = r.data;
  else if (Array.isArray(r?.results)) sessions = r.results;
  else if (Array.isArray(r?.charging_history)) sessions = r.charging_history;
  else if (Array.isArray(r?.records)) sessions = r.records;
  else if (Array.isArray(payload.data)) sessions = payload.data;

  const pagination = r?.pagination || payload?.pagination || r?.links || payload?.links || {};
  const next =
    pagination.next ||
    pagination.nextPage ||
    r?.next ||
    payload?.next ||
    (typeof pagination.pageNo === 'number' &&
    typeof pagination.totalPages === 'number' &&
    pagination.pageNo < pagination.totalPages
      ? { pageNo: pagination.pageNo + 1 }
      : null);

  return { sessions, next, pageHint: pagination };
}

function sessionEnergyKwh(session) {
  if (typeof session.energyUsed === 'number' && !Number.isNaN(session.energyUsed)) {
    return session.energyUsed;
  }
  if (Array.isArray(session.fees)) {
    let kwh = 0;
    for (const fee of session.fees) {
      if (fee && (fee.feeType === 'CHARGING' || fee.uom === 'kWh')) {
        const parts = [fee.usageBase, fee.usageTier1, fee.usageTier2, fee.usageTier3, fee.usageTier4];
        for (const p of parts) {
          if (typeof p === 'number' && !Number.isNaN(p)) kwh += p;
        }
      }
    }
    if (kwh > 0) return kwh;
  }
  return 0;
}

function sessionCost(session) {
  if (typeof session.chargeCost === 'number' && !Number.isNaN(session.chargeCost)) {
    return session.chargeCost;
  }
  if (Array.isArray(session.fees)) {
    let total = 0;
    let found = false;
    for (const fee of session.fees) {
      if (!fee) continue;
      const due =
        typeof fee.totalDue === 'number'
          ? fee.totalDue
          : typeof fee.netDue === 'number'
            ? fee.netDue
            : typeof fee.totalBase === 'number'
              ? fee.totalBase
              : null;
      if (due != null) {
        total += due;
        found = true;
      }
    }
    if (found) return total;
  }
  return 0;
}

function sessionCurrency(session) {
  if (typeof session.currencyCode === 'string' && session.currencyCode) return session.currencyCode;
  if (typeof session.currency === 'string' && session.currency) return session.currency;
  if (Array.isArray(session.fees)) {
    for (const fee of session.fees) {
      if (fee && typeof fee.currencyCode === 'string' && fee.currencyCode) return fee.currencyCode;
    }
  }
  return null;
}

/**
 * Coerce a Tesla lat/lng value. Accepts finite numbers only (string numerics ok).
 * Never invents coordinates.
 */
function asCoord(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Read lat/lng from a nested Tesla location object ({latitude,longitude} or {lat,lng,lon}).
 */
function latLngFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const lat = asCoord(obj.latitude ?? obj.lat);
  const lng = asCoord(obj.longitude ?? obj.lng ?? obj.lon);
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

/**
 * Session coordinates from known Fleet charging_history shapes.
 * Prefer siteEntryLocation; also try siteLocation, location, gps, coordinates,
 * and top-level latitude/longitude. No fabricated GPS.
 */
function sessionLatLng(session) {
  if (!session || typeof session !== 'object') return { lat: null, lng: null };
  for (const key of ['siteEntryLocation', 'siteLocation', 'location', 'gps', 'coordinates', 'siteGps']) {
    const found = latLngFromObject(session[key]);
    if (found) return found;
  }
  const lat = asCoord(session.latitude ?? session.lat);
  const lng = asCoord(session.longitude ?? session.lng ?? session.lon);
  if (lat != null && lng != null) return { lat, lng };
  return { lat: null, lng: null };
}

/**
 * City/country from siteAddress (and a few alternate address keys). No street.
 */
function sessionCityCountry(session) {
  if (!session || typeof session !== 'object') return { city: null, country: null };
  const addr =
    session.siteAddress || session.address || session.siteLocationAddress || session.site_address || {};
  const city =
    (typeof addr.city === 'string' && addr.city) ||
    (typeof session.city === 'string' && session.city) ||
    null;
  const country =
    (typeof addr.country === 'string' && addr.country) ||
    (typeof addr.countryCode === 'string' && addr.countryCode) ||
    (typeof session.country === 'string' && session.country) ||
    null;
  return { city, country };
}

function siteKey(session) {
  const { lat, lng } = sessionLatLng(session);
  const name = session?.siteLocationName || '';
  if (lat != null && lng != null) {
    return `${name}|${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
  return name || session?.sessionId || 'unknown';
}

/**
 * Load the committed static snapshot (last-known good pins). Used as a seed when
 * Blobs was overwritten with null lat/lng. Never invents coordinates.
 */
function loadStaticChargingStats() {
  try {
    return require('../../../static/data/charging-stats.json');
  } catch (_) {
    /* continue */
  }
  const fs = require('fs');
  const path = require('path');
  const candidates = [
    path.join(__dirname, '../../../static/data/charging-stats.json'),
    path.join(process.cwd(), 'static/data/charging-stats.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

/**
 * Index prior site locations by exact name (and name|city when city present).
 * Only stores real numeric lat/lng and non-empty city/country from seeds.
 */
function buildLocationIndex(seeds) {
  const byName = new Map();
  const byNameCity = new Map();

  function remember(name, city, country, lat, lng) {
    if (!name) return;
    const entry = byName.get(name) || { lat: null, lng: null, city: null, country: null };
    if (entry.lat == null && typeof lat === 'number' && typeof lng === 'number') {
      entry.lat = lat;
      entry.lng = lng;
    }
    if (!entry.city && city) entry.city = city;
    if (!entry.country && country) entry.country = country;
    byName.set(name, entry);
    if (city) {
      const key = `${name}|${city}`;
      const cur = byNameCity.get(key) || { lat: null, lng: null, city: null, country: null };
      if (cur.lat == null && typeof lat === 'number' && typeof lng === 'number') {
        cur.lat = lat;
        cur.lng = lng;
      }
      if (!cur.city && city) cur.city = city;
      if (!cur.country && country) cur.country = country;
      byNameCity.set(key, cur);
    }
  }

  for (const seed of seeds || []) {
    if (!seed) continue;
    for (const site of seed.sites || []) {
      if (!site || !site.name) continue;
      remember(site.name, site.city || null, site.country || null, site.lat, site.lng);
    }
    const ls = seed.lastStop;
    if (ls && ls.name) {
      remember(ls.name, ls.city || null, ls.country || null, ls.lat, ls.lng);
    }
  }

  return { byName, byNameCity };
}

function lookupPriorLocation(index, name, city) {
  if (!name || !index) return null;
  if (city) {
    const hit = index.byNameCity.get(`${name}|${city}`);
    if (hit) return hit;
  }
  return index.byName.get(name) || null;
}

/**
 * Copy lat/lng/city/country from prior snapshot(s) onto sites (and lastStop)
 * that are missing them. Match by site name; if needed, name+city.
 * Does not invent coordinates — only copies values already present in seeds.
 */
function preserveLocationsFromPrior(snapshot, seeds) {
  if (!snapshot || !Array.isArray(snapshot.sites)) return snapshot;
  const index = buildLocationIndex(seeds);
  for (const site of snapshot.sites) {
    if (!site || !site.name) continue;
    const prior = lookupPriorLocation(index, site.name, site.city);
    if (!prior) continue;
    if (site.lat == null && typeof prior.lat === 'number' && typeof prior.lng === 'number') {
      site.lat = prior.lat;
      site.lng = prior.lng;
    }
    if (!site.city && prior.city) site.city = prior.city;
    if (!site.country && prior.country) site.country = prior.country;
  }
  if (snapshot.lastStop && snapshot.lastStop.name) {
    const ls = snapshot.lastStop;
    const prior = lookupPriorLocation(index, ls.name, ls.city);
    if (prior) {
      if (ls.lat == null && typeof prior.lat === 'number' && typeof prior.lng === 'number') {
        ls.lat = prior.lat;
        ls.lng = prior.lng;
      }
      if (!ls.city && prior.city) ls.city = prior.city;
      if (!ls.country && prior.country) ls.country = prior.country;
    }
  }
  return snapshot;
}

function monthKeyFromIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[m - 1] || key;
}

function formatPeriodLabel(startIso, endIso) {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : new Date();
  const startStr =
    start && !Number.isNaN(start.getTime())
      ? start.toLocaleDateString('en-GB', opts)
      : 'start';
  const endStr =
    end && !Number.isNaN(end.getTime()) ? end.toLocaleDateString('en-GB', opts) : 'today';
  const today = new Date();
  const endIsToday =
    end &&
    end.getUTCFullYear() === today.getUTCFullYear() &&
    end.getUTCMonth() === today.getUTCMonth() &&
    end.getUTCDate() === today.getUTCDate();
  return `Europe, plugged in — ${startStr} to ${endIsToday ? 'today' : endStr}`;
}

function majorityCurrency(codes, fallback) {
  const counts = new Map();
  for (const c of codes || []) {
    if (!c) continue;
    const key = String(c).toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let n = 0;
  for (const [c, v] of counts) {
    if (v > n) {
      best = c;
      n = v;
    }
  }
  return best || fallback || null;
}

/**
 * Sanitize Tesla charging_history sessions into a public snapshot.
 * Omits VIN, street address, cabinet IDs. City + site name + Supercharger lat/lng OK.
 */
function aggregateSnapshot(sessions, meta) {
  const sitesMap = new Map();
  const monthsMap = new Map();
  let totalKwh = 0;
  let totalSpent = 0;
  let currency = null;
  let earliest = null;
  let latest = null;
  let lastStop = null;
  let lastStopTs = null;

  for (const session of sessions) {
    if (!session) continue;
    // sessionCost() is the source of truth for totals.spent and site.spent
    const kwh = sessionEnergyKwh(session);
    const cost = sessionCost(session);
    const cur = sessionCurrency(session);
    if (cur && !currency) currency = cur;
    totalKwh += kwh;
    totalSpent += cost;

    const start = session.chargeStartDateTime || session.chargeStopDateTime;
    const stop = session.chargeStopDateTime || session.chargeStartDateTime;
    if (start) {
      const t = new Date(start).getTime();
      if (!Number.isNaN(t) && (earliest == null || t < earliest)) earliest = t;
    }
    if (stop) {
      const t = new Date(stop).getTime();
      if (!Number.isNaN(t) && (latest == null || t > latest)) latest = t;
    }

    const mk = monthKeyFromIso(start || stop);
    if (mk) {
      const prev = monthsMap.get(mk) || {
        key: mk,
        label: monthLabel(mk),
        energyKwh: 0,
        sessionCount: 0,
        spent: 0,
      };
      prev.energyKwh += kwh;
      prev.sessionCount += 1;
      prev.spent += cost;
      monthsMap.set(mk, prev);
    }

    const key = siteKey(session);
    const { lat, lng } = sessionLatLng(session);
    const { city, country } = sessionCityCountry(session);
    const name = session?.siteLocationName || city || 'Supercharger';
    const prev = sitesMap.get(key) || {
      name,
      city,
      country,
      lat: lat != null ? lat : null,
      lng: lng != null ? lng : null,
      energyKwh: 0,
      sessionCount: 0,
      spent: 0,
      currencies: [],
      sessions: [],
    };
    prev.energyKwh += kwh;
    prev.sessionCount += 1;
    prev.spent += cost;
    if (cur) prev.currencies.push(cur);
    prev.sessions.push({
      at: stop || start || null,
      energyKwh: Math.round(kwh * 10) / 10,
      spent: Math.round(cost * 100) / 100,
      currency: cur,
    });
    if (prev.lat == null && lat != null) prev.lat = lat;
    if (prev.lng == null && lng != null) prev.lng = lng;
    if (!prev.city && city) prev.city = city;
    if (!prev.country && country) prev.country = country;
    sitesMap.set(key, prev);

    if (stop) {
      const t = new Date(stop).getTime();
      if (!Number.isNaN(t) && (lastStopTs == null || t > lastStopTs)) {
        lastStopTs = t;
        lastStop = {
          name,
          city,
          country,
          at: stop,
          lat: lat != null ? lat : null,
          lng: lng != null ? lng : null,
        };
      }
    }
  }

  const months = Array.from(monthsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  // Prefer last 3 calendar months when there are many; otherwise all in range.
  const monthsOut = months.length > 3 ? months.slice(-3) : months;

  const fallbackCurrency = currency || (totalSpent > 0 ? 'EUR' : null);
  const sites = Array.from(sitesMap.values())
    .map((s) => ({
      name: s.name,
      city: s.city,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      energyKwh: Math.round(s.energyKwh * 10) / 10,
      sessionCount: s.sessionCount,
      spent: Math.round(s.spent * 100) / 100,
      currency: majorityCurrency(s.currencies, fallbackCurrency),
      sessions: (s.sessions || [])
        .slice()
        .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))),
    }))
    .sort((a, b) => b.energyKwh - a.energyKwh);

  const startIso = earliest != null ? new Date(earliest).toISOString() : null;
  const endIso = latest != null ? new Date(latest).toISOString() : new Date().toISOString();

  return {
    updatedAt: new Date().toISOString(),
    source: 'tesla_fleet_charging_history',
    note: 'Tesla-billed public/Supercharger sessions only (not home charging).',
    vehicle: 'Tesla Model Y',
    period: {
      start: startIso,
      end: endIso,
      label: formatPeriodLabel(startIso, endIso),
    },
    totals: {
      energyKwh: Math.round(totalKwh * 10) / 10,
      sessionCount: sessions.length,
      uniqueSites: sites.length,
      spent: Math.round(totalSpent * 100) / 100,
      currency: fallbackCurrency,
    },
    months: monthsOut.map((m) => ({
      key: m.key,
      label: m.label,
      energyKwh: Math.round(m.energyKwh * 10) / 10,
      sessionCount: m.sessionCount,
      spent: Math.round((m.spent || 0) * 100) / 100,
    })),
    sites,
    lastStop: lastStop || undefined,
    meta: meta || undefined,
  };
}

async function fetchAllChargingHistory(accessToken, vin) {
  const all = [];
  let pageNo = 1;
  const pageSize = 50;
  const maxPages = 40;
  // Drop sort params after a first-page 400 — Tesla may reject sortBy values.
  let useSort = true;

  while (pageNo <= maxPages) {
    const url = new URL(`${fleetBase()}/api/1/dx/charging/history`);
    if (vin) url.searchParams.set('vin', vin);
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('pageSize', String(pageSize));
    if (useSort) {
      url.searchParams.set('sortBy', 'chargeStartDateTime');
      url.searchParams.set('sortOrder', 'DESC');
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401 || res.status === 403) {
      const err = new Error(`Tesla charging_history unauthorized (${res.status})`);
      err.status = res.status;
      err.code = 'TESLA_AUTH';
      throw err;
    }
    // First page 400 with sort: retry once without sortBy/sortOrder.
    if (res.status === 400 && pageNo === 1 && useSort) {
      useSort = false;
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Tesla charging_history failed (${res.status})`);
      err.status = res.status;
      err.code = 'TESLA_API';
      err.detail = text.slice(0, 300);
      throw err;
    }

    const payload = await res.json();
    const { sessions, pageHint } = pickSessions(payload);
    if (!sessions.length) break;
    all.push(...sessions);

    const totalPages =
      pageHint && typeof pageHint.totalPages === 'number' ? pageHint.totalPages : null;
    if (totalPages != null && pageNo >= totalPages) break;
    if (sessions.length < pageSize) break;
    pageNo += 1;
  }

  return all;
}

module.exports = {
  AUTH_AUTHORIZE_HOST,
  AUTH_AUTHORIZE_URL,
  AUTH_TOKEN_URL,
  DOMAIN,
  KEY_REFRESH,
  KEY_SNAPSHOT,
  REDIRECT_URI,
  SCOPES,
  aggregateSnapshot,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchAllChargingHistory,
  fleetBase,
  getRefreshToken,
  getSnapshot,
  htmlResponse,
  jsonResponse,
  loadStaticChargingStats,
  partnerAccessToken,
  persistTokensFromResponse,
  preserveLocationsFromPrior,
  refreshAccessToken,
  requiredEnv,
  sessionCityCountry,
  sessionLatLng,
  setRefreshToken,
  setSnapshot,
  setupSecretOk,
  teslaStore,
};
