import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleClientMetadata } from './routes/clientMetadata.js';
import { handleRecommend, handleRecommendPost } from './routes/recommend.js';
import { handleSubscribe, handleSubscribePost } from './routes/subscribe.js';
import { handleUnsubscribe, handleUnsubscribePost } from './routes/unsubscribe.js';
import { handleShare, handleSharePost } from './routes/share.js';
import { handleInitiate } from './routes/initiate.js';
import { handleCallback } from './routes/callback.js';
import { handleStatus } from './routes/status.js';
import { handleNotify } from './routes/notify.js';
import { handleEvents } from './routes/events.js';
import { handleCounts } from './routes/counts.js';
import { handleAddOrigin } from './routes/origins.js';
import { allowedOrigins } from './db.js';

export const app = new Hono();

app.get('/client-metadata.json', handleClientMetadata);
app.get('/recommend', handleRecommend);
app.post('/recommend', handleRecommendPost);
app.get('/subscribe', handleSubscribe);
app.post('/subscribe', handleSubscribePost);
app.get('/unsubscribe', handleUnsubscribe);
app.post('/unsubscribe', handleUnsubscribePost);
app.get('/share', handleShare);
app.post('/share', handleSharePost);
app.post('/initiate', handleInitiate);
app.get('/callback', handleCallback);

app.get('/status/:token', handleStatus);
app.post('/notify', handleNotify);
app.post('/origins', handleAddOrigin);
app.get('/events', handleEvents);
app.use(
  '/counts',
  cors({ origin: (origin) => (allowedOrigins.isAllowed(origin) ? origin : undefined) })
);
app.get('/counts', handleCounts);
app.get('/health', (c) => c.json({ ok: true }));
