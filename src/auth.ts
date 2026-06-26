import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE } from './config.js';
import { sessionStore } from './db.js';
import { verifySessionId } from './session.js';

export function getSessionDid(c: Context): string | null {
  const cookieValue = getCookie(c, SESSION_COOKIE);
  if (!cookieValue) return null;
  const sessionId = verifySessionId(cookieValue);
  if (!sessionId) return null;
  const did = sessionStore.get(sessionId);
  if (!did) return null;
  sessionStore.touch(sessionId);
  return did;
}

export function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}
