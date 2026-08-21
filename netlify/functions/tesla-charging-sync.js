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

exports.handler = async (event) => {
  try {
    const refreshToken = await getRefreshToken(event);
    if (!refreshToken) {
      return jsonResponse(200, {
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
      return jsonResponse(200, {
        ok: false,
        skipped: true,
        reason: 'Token refresh failed; kept last snapshot',
        hasSnapshot: Boolean(existing),
      });
    }

    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
      return jsonResponse(200, {
        ok: false,
        skipped: true,
        reason: 'No access token in refresh response; kept last snapshot',
      });
    }

    const vin = requiredEnv('TESLA_VIN');
    let sessions;
    try {
      sessions = await fetchAllChargingHistory(accessToken, vin);
    } catch (err) {
      if (err.code === 'TESLA_AUTH') {
        const existing = await getSnapshot(event);
        return jsonResponse(200, {
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

    return jsonResponse(200, {
      ok: true,
      updatedAt: snapshot.updatedAt,
      totals: snapshot.totals,
    });
  } catch (err) {
    // Never wipe the last good snapshot on unexpected errors.
    return jsonResponse(500, {
      ok: false,
      error: err.code || 'SYNC_ERROR',
      message: err.message || 'Sync failed',
    });
  }
};
