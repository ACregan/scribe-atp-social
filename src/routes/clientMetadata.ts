import type { Context } from 'hono';
import { oauthClient } from '../oauth.js';

// Served from the OAuth client itself, so the published metadata can't
// drift from what the client signs readers in with.
export function handleClientMetadata(c: Context) {
  return c.json(oauthClient.clientMetadata, 200, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
}
