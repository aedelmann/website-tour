/**
 * Shared Tesla Fleet API helpers for Silent Wanderers.
 * Official Fleet API only (EU). Never log tokens.
 */

const { getStore } = require('@netlify/blobs');

const DEFAULT_FLEET_BASE = 'https://fleet-api.prd.eu.vn.cloud.tesla.com';
const AUTH_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
const AUTH_AUTHORIZE_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/authorize';
const REDIRECT_URI = 'https://silentwanderers.com/.netlify/functions/tesla-oauth-callback';
const DOMAIN = 'silentwanderers.com';
const SCOPES = 'openid offline_access vehicle_device_data vehicle_charging_cmds';

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

function teslaStore() {
  return getStore({ name: BLOB_STORE, consistency: 'strong' });
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
    scope: 'openid offline_access vehicle_device_data vehicle_charging_cmds',
  });
}

async function getRefreshToken() {
  const store = teslaStore();
  return store.get(KEY_REFRESH);
}

async function setRefreshToken(token) {
  if (!token) return;
  const store = teslaStore();
  await store.set(KEY_REFRESH, token);
}

async function getSnapshot() {
  const store = teslaStore();
  const raw = await store.get(KEY_SNAPSHOT, { type: 'text' });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setSnapshot(snapshot) {
  const store = teslaStore();
  await store.set(KEY_SNAPSHOT, JSON.stringify(snapshot));
}

/**
 * Persist a new refresh token whenever Tesla returns one (each refresh invalidates the prior).
 */
async function persistTokensFromResponse(tokenResponse) {
  if (tokenResponse && tokenResponse.refresh_token) {
    await setRefreshToken(tokenResponse.refresh_token);
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

function siteKey(session) {
  const lat = session?.siteEntryLocation?.latitude;
  const lng = session?.siteEntryLocation?.longitude;
  const name = session?.siteLocationName || '';
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${name}|${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
  return name || session?.sessionId || 'unknown';
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

  for (const session of sessions) {
    if (!session) continue;
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
      const prev = monthsMap.get(mk) || { key: mk, label: monthLabel(mk), energyKwh: 0, sessionCount: 0 };
      prev.energyKwh += kwh;
      prev.sessionCount += 1;
      monthsMap.set(mk, prev);
    }

    const key = siteKey(session);
    const lat = session?.siteEntryLocation?.latitude;
    const lng = session?.siteEntryLocation?.longitude;
    const city = session?.siteAddress?.city || null;
    const country = session?.siteAddress?.country || session?.siteAddress?.countryCode || null;
    const name = session?.siteLocationName || city || 'Supercharger';
    const prev = sitesMap.get(key) || {
      name,
      city,
      country,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      energyKwh: 0,
      sessionCount: 0,
    };
    prev.energyKwh += kwh;
    prev.sessionCount += 1;
    if (prev.lat == null && typeof lat === 'number') prev.lat = lat;
    if (prev.lng == null && typeof lng === 'number') prev.lng = lng;
    sitesMap.set(key, prev);
  }

  const months = Array.from(monthsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  // Prefer last 3 calendar months when there are many; otherwise all in range.
  const monthsOut = months.length > 3 ? months.slice(-3) : months;

  const sites = Array.from(sitesMap.values())
    .map((s) => ({
      name: s.name,
      city: s.city,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      energyKwh: Math.round(s.energyKwh * 10) / 10,
      sessionCount: s.sessionCount,
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
      currency: currency || (totalSpent > 0 ? 'EUR' : null),
    },
    months: monthsOut.map((m) => ({
      key: m.key,
      label: m.label,
      energyKwh: Math.round(m.energyKwh * 10) / 10,
      sessionCount: m.sessionCount,
    })),
    sites,
    meta: meta || undefined,
  };
}

async function fetchAllChargingHistory(accessToken, vin) {
  const all = [];
  let pageNo = 1;
  const pageSize = 50;
  const maxPages = 40;

  while (pageNo <= maxPages) {
    const url = new URL(`${fleetBase()}/api/1/dx/charging/history`);
    if (vin) url.searchParams.set('vin', vin);
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('sortBy', 'chargeStartDateTime');
    url.searchParams.set('sortOrder', 'DESC');

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
  partnerAccessToken,
  persistTokensFromResponse,
  refreshAccessToken,
  requiredEnv,
  setRefreshToken,
  setSnapshot,
  setupSecretOk,
  teslaStore,
};
