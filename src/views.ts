import { html } from 'hono/html';

export function handleForm(opts: {
  heading: string;
  subtitle: string;
  action: 'recommend' | 'subscribe';
  uri: string;
  origin: string;
  title: string;
  error?: string;
}) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.heading} — Scribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    h1 { font-size: 1.2rem; margin-bottom: 0.5rem; color: #111; }
    .subtitle { color: #555; font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.5; }
    label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.375rem; color: #333; }
    input[type="text"] { display: block; width: 100%; padding: 0.625rem 0.75rem;
                          border: 1.5px solid #ddd; border-radius: 8px; font-size: 1rem; outline: none; }
    input[type="text"]:focus { border-color: #0085ff; }
    button[type="submit"] { display: block; width: 100%; margin-top: 1rem; padding: 0.625rem;
                             background: #0085ff; color: #fff; border: none; border-radius: 8px;
                             font-size: 1rem; font-weight: 600; cursor: pointer; }
    button[type="submit"]:hover { background: #006ed4; }
    .error { color: #b00020; background: #fff0f0; border: 1px solid #ffcdd2; border-radius: 8px;
             padding: 0.75rem 1rem; font-size: 0.875rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${opts.heading}</h1>
    <p class="subtitle">${opts.subtitle}</p>
    ${opts.error ? html`<div class="error">${opts.error}</div>` : ''}
    <form method="POST" action="/initiate">
      <input type="hidden" name="action" value="${opts.action}">
      <input type="hidden" name="uri" value="${opts.uri}">
      <input type="hidden" name="origin" value="${opts.origin}">
      <input type="hidden" name="title" value="${opts.title}">
      <label for="handle">Your Bluesky handle</label>
      <input type="text" id="handle" name="handle" placeholder="you.bsky.social"
             autocomplete="username" required autofocus>
      <button type="submit">Continue with Bluesky</button>
    </form>
  </div>
</body>
</html>`;
}

export function confirmPage(opts: {
  action: 'recommend' | 'subscribe';
  handle: string;
  uri: string;
  origin: string;
  title: string;
}) {
  const heading = opts.action === 'recommend'
    ? (opts.title ? `Like "${opts.title}"` : 'Like this article')
    : (opts.title ? `Subscribe to ${opts.title}` : 'Subscribe');
  const confirmText = opts.action === 'recommend'
    ? `Like as @${opts.handle}?`
    : `Subscribe as @${opts.handle}?`;
  const buttonText = opts.action === 'recommend' ? 'Like' : 'Subscribe';
  const hiddenName = opts.action === 'recommend' ? 'document' : 'publication';

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading} — Scribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; }
    h1 { font-size: 1.2rem; margin-bottom: 0.5rem; color: #111; }
    .handle { color: #555; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .actions { display: flex; gap: 0.75rem; }
    button { flex: 1; padding: 0.625rem; border: none; border-radius: 8px;
             font-size: 1rem; font-weight: 600; cursor: pointer; }
    button[type="submit"] { background: #0085ff; color: #fff; }
    button[type="submit"]:hover { background: #006ed4; }
    button[type="button"] { background: #eee; color: #333; }
    button[type="button"]:hover { background: #ddd; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p class="handle">${confirmText}</p>
    <form method="POST" action="/${opts.action}">
      <input type="hidden" name="${hiddenName}" value="${opts.uri}">
      <input type="hidden" name="origin" value="${opts.origin}">
      <div class="actions">
        <button type="button" onclick="window.close()">Cancel</button>
        <button type="submit">${buttonText}</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

export function alreadyActioned(opts: {
  action: 'recommend' | 'subscribe';
  title: string;
}) {
  const message = opts.action === 'recommend'
    ? (opts.title ? `You already liked "${opts.title}".` : 'You already liked this article.')
    : (opts.title ? `You are already subscribed to ${opts.title}.` : 'You are already subscribed.');

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.action === 'recommend' ? 'Liked' : 'Subscribed'} — Scribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; }
    h1 { font-size: 1.2rem; margin-bottom: 0.75rem; color: #111; }
    p { color: #555; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    button { padding: 0.625rem 1.5rem; background: #0085ff; color: #fff; border: none;
             border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #006ed4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${opts.action === 'recommend' ? 'Already liked ✓' : 'Already subscribed ✓'}</h1>
    <p>${message}</p>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
}

export function successPage(opts: {
  action: 'recommend' | 'subscribe';
  origin: string;
}) {
  const heading = opts.action === 'recommend' ? 'Liked ✓' : 'Subscribed ✓';
  const message = opts.action === 'recommend'
    ? 'Thanks for the like!'
    : 'Thanks for subscribing!';

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading} — Scribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #111; }
    p { color: #555; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${message}</p>
  </div>
  <script>
    try {
      window.opener.postMessage({ ok: true, action: ${JSON.stringify(opts.action)} }, ${JSON.stringify(opts.origin)});
    } catch (_) {}
    setTimeout(() => window.close(), 1200);
  </script>
</body>
</html>`;
}

export function errorPage(message: string) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error — Scribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 360px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1); text-align: center; }
    h1 { font-size: 1.2rem; margin-bottom: 0.75rem; color: #111; }
    p { color: #555; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    button { padding: 0.625rem 1.5rem; background: #0085ff; color: #fff; border: none;
             border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #006ed4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${message}</p>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
}
