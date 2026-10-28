import { serve } from '@hono/node-server';
import { app } from './app.js';
import { migrate, prune } from './db.js';

const port = Number(process.env.PORT ?? 3011);
const HOUR_MS = 60 * 60 * 1000;

await migrate();
await prune();
setInterval(() => {
  prune().catch((err) => console.error('[prune] failed:', err));
}, HOUR_MS);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`skyscribe-social listening on http://localhost:${info.port}`);
});
