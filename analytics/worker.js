// Bush Hills Church of Christ - Usage analytics backend (Cloudflare Worker)
//
// Two endpoints, CORS-scoped to bushhillschurch.com:
//   POST /track  - { event, path } -> logs one usage event. No auth -
//                  these are anonymous, low-stakes usage counts, not
//                  anything sensitive, so it stays simple/fast for the
//                  browser to fire-and-forget.
//   GET  /stats?pin=XXXX - PIN-gated. Returns aggregated counts: total
//                  events, pageviews by path, event counts by type, and
//                  events in the last 7 days. Powers the admin dashboard.
//
// Requires, set in the Cloudflare dashboard (Settings -> Bindings /
// Variables and Secrets):
//   D1 database binding named "DB"  -> analytics-db
//   Secret "SUBMIT_PIN"             -> SAME value as the announcements
//                                      Worker's SUBMIT_PIN, set here too
//                                      (each Worker checks its own copy
//                                      of the secret - there's no
//                                      cross-Worker secret sharing).

const ALLOWED_ORIGIN = 'https://bushhillschurch.com';

function corsHeaders(extra) {
  return Object.assign(
    {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    extra || {}
  );
}

async function handleTrack(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  const eventName = (body.event || '').slice(0, 100);
  const path = (body.path || '').slice(0, 200);

  if (!eventName) {
    return new Response(JSON.stringify({ error: 'No event name provided' }), {
      status: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  await env.DB.prepare('INSERT INTO events (id, event_name, path, created_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), eventName, path, new Date().toISOString())
    .run();

  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

async function handleStats(request, env) {
  const url = new URL(request.url);
  const pin = url.searchParams.get('pin') || '';

  if (pin !== env.SUBMIT_PIN) {
    return new Response(JSON.stringify({ error: 'Incorrect PIN' }), {
      status: 401,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [totalResult, byPathResult, byEventResult, recentResult] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM events').first(),
    env.DB.prepare(
      "SELECT path, COUNT(*) as count FROM events WHERE event_name = 'pageview' AND path IS NOT NULL AND path != '' GROUP BY path ORDER BY count DESC LIMIT 15"
    ).all(),
    env.DB.prepare('SELECT event_name, COUNT(*) as count FROM events GROUP BY event_name ORDER BY count DESC').all(),
    env.DB.prepare('SELECT COUNT(*) as count FROM events WHERE created_at >= ?').bind(sevenDaysAgo).first(),
  ]);

  return new Response(
    JSON.stringify({
      totalEvents: totalResult ? totalResult.count : 0,
      last7Days: recentResult ? recentResult.count : 0,
      pageviewsByPath: byPathResult ? byPathResult.results : [],
      eventsByType: byEventResult ? byEventResult.results : [],
    }),
    { headers: corsHeaders({ 'Content-Type': 'application/json' }) }
  );
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/track') {
        return await handleTrack(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/stats') {
        return await handleStats(request, env);
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};
