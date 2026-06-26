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
