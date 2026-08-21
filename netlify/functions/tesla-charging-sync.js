/**
 * Scheduled sync (~every 6 hours): refresh token, paginate charging_history,
 * write sanitized public snapshot to Blobs. Never wakes the vehicle.
 * Schedule configured in netlify.toml (cron every 6 hours).
 */
const {
  aggregateSnapshot,
  fetchAllChargingHistory,
  getRefreshToken,
  getSnapshot,
  jsonResponse,
  persistTokensFromResponse,
  refreshAccessToken,
  requiredEnv,
  setSnapshot,
} = require('./_lib/tesla');

/**
 * One safe JSON log line per return. Never log tokens, VIN, secrets, or raw sessions.
 */
function logSyncResult(body) {
  const safe = { ok: body.ok };
  if (body.skipped !== undefined) safe.skipped = body.skipped;
  if (body.reason !== undefined) safe.reason = body.reason;
  if (body.hasSnapshot !== undefined) safe.hasSnapshot = body.hasSnapshot;
  if (body.error !== undefined) safe.error = body.error;
  if (body.message !== undefined) safe.message = body.message;
  // TESLA_API: status + Tesla body snippet (err.detail). Never tokens/VIN.
  if (body.status !== undefined) safe.status = body.status;
  if (body.detail !== undefined) safe.detail = body.detail;
  if (body.updatedAt !== undefined) safe.updatedAt = body.updatedAt;
  if (body.totals && body.totals.sessionCount !== undefined) {
    safe.totals = { sessionCount: body.totals.sessionCount };
  }
  console.log(JSON.stringify(safe));
}

function respond(status, body) {
  logSyncResult(body);
  return jsonResponse(status, body);
}

exports.handler = async (event) => {
  try {
    const refreshToken = await getRefreshToken(event);
    if (!refreshToken) {
      return respond(200, {
        ok: false,
        skipped: true,
        reason: 'No refresh token. Run tesla-oauth bootstrap first.',
      });
    }

    let tokenResponse;
    try {
      tokenResponse = await refreshAccessToken(refreshToken);
      await persistTokensFromResponse(event, tokenResponse);
    } catch (err) {
      // Leave last good snapshot on auth failure.
      const existing = await getSnapshot(event);
      return respond(200, {
        ok: false,
        skipped: true,
        reason: 'Token refresh failed; kept last snapshot',
        hasSnapshot: Boolean(existing),
      });
    }

    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
      return respond(200, {
        ok: false,
        skipped: true,
        reason: 'No access token in refresh response; kept last snapshot',
      });
    }

    const vin = requiredEnv('TESLA_VIN').trim();
    let sessions;
    try {
      sessions = await fetchAllChargingHistory(accessToken, vin);
    } catch (err) {
      if (err.code === 'TESLA_AUTH') {
        const existing = await getSnapshot(event);
        return respond(200, {
          ok: false,
          skipped: true,
          reason: 'Tesla 401/403 on charging_history; kept last snapshot',
          hasSnapshot: Boolean(existing),
        });
      }
      throw err;
    }

    const snapshot = aggregateSnapshot(sessions, {
      sessionCountFetched: sessions.length,
    });
    await setSnapshot(event, snapshot);

    return respond(200, {
      ok: true,
      updatedAt: snapshot.updatedAt,
      totals: snapshot.totals,
    });
  } catch (err) {
    // Never wipe the last good snapshot on unexpected errors.
    const body = {
      ok: false,
      error: err.code || 'SYNC_ERROR',
      message: err.message || 'Sync failed',
    };
    if (err.status != null) body.status = err.status;
    // Safe Tesla error body snippet only (already sliced; never tokens/VIN).
    if (err.detail != null) body.detail = err.detail;
    return respond(500, body);
  }
};
