/**
 * One-time OAuth bootstrap: redirects the vehicle owner to Tesla authorize.
 * Protect with TESLA_SETUP_SECRET (?secret= or x-tesla-setup-secret header).
 */
const { buildAuthorizeUrl, htmlResponse, setupSecretOk } = require('./_lib/tesla');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return htmlResponse(405, '<p>Method not allowed</p>');
  }
  if (!setupSecretOk(event)) {
    return htmlResponse(401, '<p>Unauthorized. Provide TESLA_SETUP_SECRET.</p>');
  }

  try {
    const state = `sw-${Date.now().toString(36)}`;
    const url = buildAuthorizeUrl(state);
    return {
      statusCode: 302,
      headers: {
        Location: url,
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  } catch (err) {
    return htmlResponse(
      500,
      `<p>Cannot start OAuth. Check TESLA_CLIENT_ID is set.</p>`
    );
  }
};
