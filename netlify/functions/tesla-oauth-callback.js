/**
 * OAuth callback: exchanges code for tokens and stores refresh token in Netlify Blobs.
 * Never logs tokens.
 */
const {
  exchangeAuthorizationCode,
  htmlResponse,
  persistTokensFromResponse,
} = require('./_lib/tesla');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return htmlResponse(405, '<p>Method not allowed</p>');
  }

  const q = event.queryStringParameters || {};
  if (q.error) {
    const desc = q.error_description ? ` — ${escapeHtml(q.error_description)}` : '';
    return htmlResponse(
      400,
      `<p>Tesla authorization failed: ${escapeHtml(q.error)}${desc}</p>`
    );
  }
  if (!q.code) {
    return htmlResponse(400, '<p>Missing authorization code.</p>');
  }

  try {
    const tokens = await exchangeAuthorizationCode(q.code);
    await persistTokensFromResponse(tokens);
    return htmlResponse(
      200,
      `<!DOCTYPE html><html><head><title>Tesla connected</title></head><body>
        <h1>Silent Wanderers · Tesla connected</h1>
        <p>Refresh token stored. The scheduled sync will update Charge Stats.</p>
        <p><a href="/charging/">View Charge Stats</a></p>
      </body></html>`
    );
  } catch (err) {
    const safe = {
      status: err.status != null ? err.status : null,
      teslaError: err.teslaError || null,
      teslaErrorDescription: err.teslaErrorDescription || null,
      code: err.code || null,
    };
    // Never log code, access_token, refresh_token, or client_secret.
    console.error('Tesla token exchange failed', safe);
    const statusLabel = safe.status != null ? String(safe.status) : 'n/a';
    const teslaError = safe.teslaError || 'n/a';
    const teslaDesc = safe.teslaErrorDescription || err.message || 'n/a';
    const ourCode = safe.code || 'n/a';
    return htmlResponse(
      500,
      `<!DOCTYPE html><html><head><title>Tesla token exchange failed</title></head><body>
        <h1>Token exchange failed</h1>
        <p>HTTP status: ${escapeHtml(statusLabel)}</p>
        <p>Tesla error: ${escapeHtml(teslaError)}</p>
        <p>error_description: ${escapeHtml(teslaDesc)}</p>
        <p>code: ${escapeHtml(ourCode)}</p>
      </body></html>`
    );
  }
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
