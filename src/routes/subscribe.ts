import type { Context } from 'hono';
import { html } from 'hono/html';
import { ALLOWED_ORIGINS } from '../config.js';
import { getSessionDid } from '../auth.js';
import { handleForm } from '../views.js';

export async function handleSubscribe(c: Context) {
  const publicationUri = c.req.query('publication') ?? '';
  const origin = c.req.query('origin') ?? '';
  const title = c.req.query('title') ?? '';

  if (!ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])) {
    return c.text('Invalid origin', 400);
  }
  if (!publicationUri.startsWith('at://')) {
    return c.text('Invalid publication URI', 400);
  }

  const did = getSessionDid(c);

  if (did) {
    // Confirmation UI is added in SOCIAL #3
    return c.html(html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscribe — Scribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; }
    p { color: #555; font-size: 0.875rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <p>Signed in as <code>${did}</code>. Subscribe confirmation UI coming soon.</p>
  </div>
</body>
</html>`);
  }

  return c.html(
    handleForm({
      heading: title ? `Subscribe to ${title}` : 'Subscribe',
      subtitle: 'Sign in with your Bluesky account to subscribe.',
      action: 'subscribe',
      uri: publicationUri,
      origin,
      title,
    })
  );
}
