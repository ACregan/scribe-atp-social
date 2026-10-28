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

export const app = new Hono();

app.get('/client-metadata.json', handleClientMetadata);
app.get('/recommend', handleRecommend);
app.post('/recommend', handleRecommendPost);
// /follow and /unfollow are the paths (ADR 0097 decision 12). /subscribe and
// /unsubscribe stay for older SDK versions and DMs already sent.
app.get('/follow', handleSubscribe);
app.post('/follow', handleSubscribePost);
app.get('/unfollow', handleUnsubscribe);
app.post('/unfollow', handleUnsubscribePost);
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
app.get('/events', handleEvents);
// Open to any website (ADR 0097 decision 5): the counts are public totals,
// and /counts is rate-limited per IP.
app.use('/counts', cors({ origin: '*' }));
app.get('/counts', handleCounts);
app.get('/health', (c) => c.json({ ok: true }));
