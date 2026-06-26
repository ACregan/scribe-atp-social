import type { Context } from 'hono';
import { completionTokens } from '../db.js';

export function handleStatus(c: Context) {
  const token = c.req.param('token');
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'no-store');
  if (!token) return c.json({ ok: false }, 400);
  const action = completionTokens.lookup(token);
  if (!action) return c.json({ ok: false });
  return c.json({ ok: true, action });
}
