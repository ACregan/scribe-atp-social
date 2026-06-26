import type { Context } from 'hono';
import { OAUTH_SCOPE, isProduction, publicUrl } from '../oauth.js';

export function handleClientMetadata(c: Context) {
  const redirectUri = isProduction
    ? `${publicUrl}/callback`
    : `http://127.0.0.1:${process.env.PORT ?? '3011'}/callback`;

  return c.json(
    {
      client_name: 'Scribe Social',
      client_id: `${publicUrl}/client-metadata.json`,
      client_uri: publicUrl,
      redirect_uris: [redirectUri],
      scope: OAUTH_SCOPE,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    },
    200,
    { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  );
}
