import { Hono } from 'hono';
import { handleClientMetadata } from './routes/clientMetadata.js';
import { handleRecommend, handleRecommendPost } from './routes/recommend.js';
import { handleSubscribe, handleSubscribePost } from './routes/subscribe.js';
import { handleInitiate } from './routes/initiate.js';
import { handleCallback } from './routes/callback.js';
import { handleStatus } from './routes/status.js';

export const app = new Hono();

app.get('/client-metadata.json', handleClientMetadata);
app.get('/recommend', handleRecommend);
app.post('/recommend', handleRecommendPost);
app.get('/subscribe', handleSubscribe);
app.post('/subscribe', handleSubscribePost);
app.post('/initiate', handleInitiate);
app.get('/callback', handleCallback);

app.get('/status/:token', handleStatus);
app.get('/health', (c) => c.json({ ok: true }));
