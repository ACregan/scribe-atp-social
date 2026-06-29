import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { ALLOWED_ORIGINS, PENDING_COOKIE, PENDING_MAX_AGE } from '../config.js';
import { initiateAttempts } from '../db.js';
import { oauthClient, OAUTH_SCOPE } from '../oauth.js';
import { encodePending, type PendingData } from '../session.js';
import { getClientIp } from '../auth.js';
import { handleForm, errorPage } from '../views.js';

export async function handleInitiate(c: Context) {
  const body = await c.req.parseBody();

  const handle = (body.handle as string)?.trim() ?? '';
  const action = body.action as string;
  const uri = body.uri as string;
  const origin = body.origin as string;
  const title = (body.title as string) ?? '';
  const token = (body.token as string) || undefined;
  const canonicalUrl = (body.canonicalUrl as string) || undefined;
  const publication = (body.publication as string) || undefined;

  if (!ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])) {
    return c.html(errorPage('Invalid origin.'), 400);
  }

  if (action !== 'recommend' && action !== 'subscribe' && action !== 'share') {
    return c.html(errorPage('Invalid action.'), 400);
  }

  if (!uri.startsWith('at://')) {
    return c.html(errorPage('Invalid URI.'), 400);
  }

  const headingMap = { recommend: `Like "${title}"`, subscribe: `Subscribe to ${title}`, share: `Share "${title}"` };
  const subtitleMap = {
    recommend: 'Sign in with your Bluesky account to like this article.',
    subscribe: 'Sign in with your Bluesky account to subscribe.',
    share: 'Sign in with your Bluesky account to share this article.',
  };

  const formOpts = {
    heading: headingMap[action as keyof typeof headingMap],
    subtitle: subtitleMap[action as keyof typeof subtitleMap],
    action: action as 'recommend' | 'subscribe' | 'share',
    uri,
    origin,
    title,
    token,
    canonicalUrl,
    publication,
  };

  if (!handle) {
    return c.html(handleForm({ ...formOpts, error: 'Please enter your Bluesky handle.' }));
  }

  const ip = getClientIp(c);

  if (initiateAttempts.isLimited(ip)) {
    return c.html(
      handleForm({ ...formOpts, error: 'Too many attempts. Please try again in a few minutes.' }),
      429
    );
  }

  initiateAttempts.record(ip);

  let authUrl: URL;
  try {
    authUrl = await oauthClient.authorize(handle, { scope: OAUTH_SCOPE });
  } catch (err) {
    console.error('OAuth authorize error:', err);
    return c.html(
      handleForm({
        ...formOpts,
        error: err instanceof Error ? err.message : 'Failed to start sign-in. Please check your handle and try again.',
      })
    );
  }

  const pending: PendingData = { action: action as PendingData['action'], uri, origin, title, token, canonicalUrl, publication };
  setCookie(c, PENDING_COOKIE, encodePending(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: PENDING_MAX_AGE,
  });

  return c.redirect(authUrl.toString());
}
