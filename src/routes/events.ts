import type { Context } from 'hono';
import { db } from '../db.js';
import { parseDate, validateDateRange } from '../utils/parseDate.js';

const VALID_ACTION_TYPES = new Set(['recommend', 'subscribe', 'share']);

export function handleEvents(c: Context) {
  const authHeader = c.req.header('Authorization') ?? '';
  const secret = process.env.NOTIFY_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const q = c.req.query();

  const actionType = q['action_type'];
  if (!actionType || !VALID_ACTION_TYPES.has(actionType)) {
    return c.json({ ok: false, error: 'action_type must be one of: recommend, subscribe, share' }, 400);
  }

  const publicationUri = q['publication_uri'];
  const documentUri = q['document_uri'];
  const did = q['did'];

  if (publicationUri && !publicationUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'publication_uri must be an AT URI' }, 400);
  }
  if (documentUri && !documentUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'document_uri must be an AT URI' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const from = q['from'] ? parseDate(q['from'], 0) : null;
  const to = q['to'] ? parseDate(q['to'], now) : now;

  if (from !== null) {
    const rangeError = validateDateRange(from, to);
    if (rangeError) return c.json({ ok: false, error: rangeError }, 400);
  }

  const limit = Math.min(100, Math.max(1, parseInt(q['limit'] ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(q['offset'] ?? '0', 10) || 0);

  const conditions: string[] = ['action_type = ?'];
  const params: (string | number)[] = [actionType];

  if (publicationUri) { conditions.push('publication_uri = ?'); params.push(publicationUri); }
  if (documentUri)    { conditions.push('document_uri = ?');    params.push(documentUri); }
  if (did)            { conditions.push('did = ?');              params.push(did); }
  if (from !== null)  { conditions.push('created_at >= ?');      params.push(from); }
  conditions.push('created_at <= ?'); params.push(to);

  const where = conditions.join(' AND ');

  const total = (db.prepare<(string | number)[], { count: number }>(
    `SELECT COUNT(*) as count FROM action_events WHERE ${where}`
  ).get(...params) as { count: number }).count;

  const events = db.prepare<(string | number)[], Record<string, unknown>>(
    `SELECT action_type, did, document_uri, publication_uri, origin, created_at
     FROM action_events WHERE ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return c.json({ events, total });
}
