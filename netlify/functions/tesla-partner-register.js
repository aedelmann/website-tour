/**
 * One-shot partner registration (EU).
 * POST /api/1/partner_accounts with client_credentials partner token.
 * Protected by TESLA_SETUP_SECRET.
 */
const {
  DOMAIN,
  fleetBase,
  htmlResponse,
  jsonResponse,
  partnerAccessToken,
  setupSecretOk,
} = require('./_lib/tesla');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }
  if (!setupSecretOk(event)) {
    return jsonResponse(401, { error: 'Unauthorized. Provide TESLA_SETUP_SECRET.' });
  }

  try {
    const partner = await partnerAccessToken();
    const accessToken = partner.access_token;
    if (!accessToken) {
      return jsonResponse(500, { error: 'No partner access token' });
    }

    const res = await fetch(`${fleetBase()}/api/1/partner_accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain: DOMAIN }),
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }

    // Idempotent-ish: return Tesla’s response (success or already-registered style errors).
    if (event.headers.accept && event.headers.accept.includes('text/html')) {
      return htmlResponse(
        res.status,
        `<pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`
      );
    }

    return jsonResponse(res.status, {
      ok: res.ok,
      status: res.status,
      domain: DOMAIN,
      fleetBase: fleetBase(),
      tesla: body,
    });
  } catch (err) {
    return jsonResponse(500, {
      error: err.message || 'Partner register failed',
    });
  }
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
