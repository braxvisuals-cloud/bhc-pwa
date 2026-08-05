// Bush Hills Church of Christ - Announcements backend (Cloudflare Worker)
//
// Three endpoints, all CORS-scoped to bushhillschurch.com:
//   POST /submit  - { text, pin } -> AI-cleans the text, saves it, emails
//                    a one-click delete link, publishes it immediately.
//   GET  /delete/:token - moderation safety net, marks an announcement
//                    deleted. This is the link sent in the email.
//   GET  /list     - returns active announcements (newest first) for the
//                    website's announcements feed to render.
//
// Requires, all set in the Cloudflare dashboard (Settings -> Bindings /
// Variables and Secrets):
//   D1 database binding named "DB"      -> announcements-db
//   Workers AI binding named "AI"
//   Secret "RESEND_API_KEY"             -> from resend.com (free tier)
//   Secret "SUBMIT_PIN"                 -> shared passphrase only your
//                                          announcement-writer knows, so
//                                          random internet traffic can't
//                                          post to the site
//
// NOTIFY_EMAIL is currently braxvisuals@gmail.com because Resend's free
// tier (sending from onboarding@resend.dev) only allows delivery to the
// account's own verified address. To notify a different address, verify
// a custom domain at resend.com/domains and change both NOTIFY_EMAIL and
// the `from` address in sendDeleteEmail to use that domain.

const ALLOWED_ORIGIN = 'https://bushhillschurch.com';
const NOTIFY_EMAIL = 'braxvisuals@gmail.com';
const MAX_ANNOUNCEMENTS = 10;

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

async function cleanUpText(env, rawText) {
  const result = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
    messages: [
      {
        role: 'system',
        content:
          'You clean up rough draft announcements for a church website. ' +
          'Fix grammar, spelling, and phrasing so it reads warm and polished. ' +
          'Keep every date, time, name, and factual detail exactly as given - ' +
          'do not invent, add, or remove information. Keep it concise. ' +
          'Reply with ONLY the cleaned announcement text, nothing else.',
      },
      { role: 'user', content: rawText },
    ],
  });
  const output =
    (result && result.response) ||
    (result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) ||
    rawText;
  return output.trim();
}

async function sendDeleteEmail(env, cleanedText, deleteURL) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Bush Hills Announcements <onboarding@resend.dev>',
      to: [NOTIFY_EMAIL],
      subject: 'New announcement posted to the website',
      html:
        '<p>A new announcement just went live on bushhillschurch.com:</p>' +
        '<blockquote>' + cleanedText.replace(/\n/g, '<br>') + '</blockquote>' +
        '<p><a href="' + deleteURL + '">Click here to remove it</a> if it shouldn\'t be there.</p>',
    }),
  });
}

async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  const rawText = (body.text || '').trim();
  const pin = body.pin || '';

  if (!rawText) {
    return new Response(JSON.stringify({ error: 'No announcement text provided' }), {
      status: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
  if (pin !== env.SUBMIT_PIN) {
    return new Response(JSON.stringify({ error: 'Incorrect PIN' }), {
      status: 401,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  const cleanedText = await cleanUpText(env, rawText);
  const id = crypto.randomUUID();
  const deleteToken = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO announcements (id, raw_text, cleaned_text, created_at, status, delete_token) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, rawText, cleanedText, createdAt, 'active', deleteToken)
    .run();

  const deleteURL = new URL(request.url);
  deleteURL.pathname = '/delete/' + deleteToken;

  try {
    await sendDeleteEmail(env, cleanedText, deleteURL.toString());
  } catch (e) {
    // Don't fail the submission just because the notification email failed.
  }

  return new Response(JSON.stringify({ success: true, cleanedText: cleanedText }), {
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

async function handleDelete(token, env) {
  await env.DB.prepare('UPDATE announcements SET status = ? WHERE delete_token = ?')
    .bind('deleted', token)
    .run();

  return new Response(
    '<!doctype html><html><body style="font-family:sans-serif; max-width:32em; margin:4em auto; text-align:center;">' +
      '<h2>Announcement removed</h2><p>You can close this tab.</p></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  );
}

async function handleList(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, cleaned_text, created_at FROM announcements WHERE status = 'active' ORDER BY created_at DESC LIMIT ?"
  )
    .bind(MAX_ANNOUNCEMENTS)
    .all();

  return new Response(JSON.stringify({ announcements: results }), {
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/submit') {
        return await handleSubmit(request, env);
      }
      if (request.method === 'GET' && url.pathname.startsWith('/delete/')) {
        return await handleDelete(url.pathname.replace('/delete/', ''), env);
      }
      if (request.method === 'GET' && url.pathname === '/list') {
        return await handleList(env);
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
