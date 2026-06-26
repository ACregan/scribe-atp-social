import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3010);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`scribe-atp-social listening on http://localhost:${info.port}`);
});
