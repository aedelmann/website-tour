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
    return htmlResponse(
      400,
      `<p>Tesla authorization failed: ${escapeHtml(q.error)}</p>`
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
    return htmlResponse(
      500,
      `<p>Token exchange failed. Check client credentials and redirect URI.</p>`
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
