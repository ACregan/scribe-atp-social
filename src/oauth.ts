import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { oauthStateStore, oauthSessionStore } from './db.js';
import { OAUTH_SCOPE } from './config.js';

const isProduction = process.env.NODE_ENV === 'production';
const publicUrl = process.env.PUBLIC_URL ?? 'https://social.scribe-atp.app';
const port = process.env.PORT ?? '3011';

const clientId = isProduction
  ? `${publicUrl}/client-metadata.json`
  : 'http://localhost';

const redirectUri = isProduction
  ? `${publicUrl}/callback`
  : `http://127.0.0.1:${port}/callback`;

const oauthLocks = new Map<string, Promise<unknown>>();

function requestLock<T>(key: string, fn: () => T | PromiseLike<T>): Promise<T> {
  const current = oauthLocks.get(key) ?? Promise.resolve();
  const next = current
    .then(() => fn())
    .finally(() => {
      if (oauthLocks.get(key) === next) oauthLocks.delete(key);
    });
  oauthLocks.set(key, next);
  return next;
}

export const oauthClient = new NodeOAuthClient({
  requestLock,
  clientMetadata: {
    client_name: 'Scribe Social',
    client_id: clientId,
    client_uri: isProduction ? publicUrl : 'http://localhost',
    redirect_uris: [redirectUri],
    scope: OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  },
  stateStore: oauthStateStore,
  sessionStore: oauthSessionStore,
});

export { OAUTH_SCOPE, isProduction, publicUrl };
