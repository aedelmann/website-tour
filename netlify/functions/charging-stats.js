/**
 * Public read of the sanitized charging-stats snapshot.
 * No secrets. Same-origin CORS is enough.
 */
const { getSnapshot, jsonResponse } = require('./_lib/tesla');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://silentwanderers.com',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const snapshot = await getSnapshot();
    if (!snapshot) {
      return jsonResponse(
        404,
        { error: 'No snapshot yet' },
        {
          'Access-Control-Allow-Origin': 'https://silentwanderers.com',
        }
      );
    }
    return jsonResponse(200, snapshot, {
      'Access-Control-Allow-Origin': 'https://silentwanderers.com',
      'Cache-Control': 'public, max-age=300',
    });
  } catch (err) {
    return jsonResponse(500, { error: 'Unable to read snapshot' });
  }
};
