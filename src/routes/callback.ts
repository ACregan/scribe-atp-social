import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SESSION_COOKIE, SESSION_MAX_AGE, PENDING_COOKIE } from '../config.js';
import { sessionStore } from '../db.js';
import { oauthClient } from '../oauth.js';
import { signSessionId, decodePending } from '../session.js';
import { errorPage } from '../views.js';

export async function handleCallback(c: Context) {
  const pendingRaw = getCookie(c, PENDING_COOKIE);
  const pending = pendingRaw ? decodePending(pendingRaw) : null;

  const params = new URL(c.req.url).searchParams;

  let did: string;
  try {
    const { session } = await oauthClient.callback(params);
    did = session.sub;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.html(errorPage('Authentication failed. Please close this window and try again.'), 400);
  }

  const sessionId = sessionStore.create(did);

  setCookie(c, SESSION_COOKIE, signSessionId(sessionId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'None',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  deleteCookie(c, PENDING_COOKIE, { path: '/' });

  if (!pending) {
    return c.html(errorPage('Session expired. Please close this window and try again.'), 400);
  }

  const tokenParam = pending.token ? `&token=${encodeURIComponent(pending.token)}` : '';
  let redirectPath: string;
  if (pending.action === 'recommend') {
    redirectPath = `/recommend?document=${encodeURIComponent(pending.uri)}&origin=${encodeURIComponent(pending.origin)}&title=${encodeURIComponent(pending.title)}${tokenParam}`;
  } else if (pending.action === 'subscribe') {
    redirectPath = `/subscribe?publication=${encodeURIComponent(pending.uri)}&origin=${encodeURIComponent(pending.origin)}&title=${encodeURIComponent(pending.title)}${tokenParam}`;
  } else {
    const canonicalParam = pending.canonicalUrl ? `&canonicalUrl=${encodeURIComponent(pending.canonicalUrl)}` : '';
    const pubParam = pending.publication ? `&publication=${encodeURIComponent(pending.publication)}` : '';
    redirectPath = `/share?document=${encodeURIComponent(pending.uri)}&origin=${encodeURIComponent(pending.origin)}&title=${encodeURIComponent(pending.title)}${canonicalParam}${pubParam}${tokenParam}`;
  }

  return c.redirect(redirectPath);
}
