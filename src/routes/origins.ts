import type { Context } from 'hono';
import { verifyBearerSecret } from '../session.js';
import { allowedOrigins } from '../db.js';

interface AddOriginBody {
  origin?: unknown;
  did?: unknown;
}

// https://host — no path, query, port, or trailing slash. Matches the shape
// the CMS sends: `https://${site.scribe.domain}`.
const ORIGIN_RE =
  /^https:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export async function handleAddOrigin(c: Context) {
  const authHeader = c.req.header('Authorization') ?? '';
  if (!verifyBearerSecret(authHeader, process.env.NOTIFY_SECRET)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let body: AddOriginBody;
  try {
    body = await c.req.json<AddOriginBody>();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const origin = typeof body.origin === 'string' ? body.origin : '';
  const did = typeof body.did === 'string' ? body.did : undefined;

  if (!ORIGIN_RE.test(origin)) {
    return c.json({ ok: false, error: 'Invalid origin' }, 400);
  }

  allowedOrigins.add(origin, did);
  return c.json({ ok: true });
}
