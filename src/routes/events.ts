import type { Context } from 'hono';
import { query } from '../db.js';
import { parseDate, validateDateRange } from '../utils/parseDate.js';
import { verifyBearerSecret } from '../session.js';

const VALID_ACTION_TYPES = new Set(['recommend', 'subscribe', 'share']);

export async function handleEvents(c: Context) {
  const authHeader = c.req.header('Authorization') ?? '';
  if (!verifyBearerSecret(authHeader, process.env.NOTIFY_SECRET)) {
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

  const params: (string | number)[] = [actionType];
  const conditions: string[] = ['action_type = $1'];
  // Each condition takes the next $n placeholder.
  const add = (sql: string, value: string | number) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (publicationUri) add('publication_uri = ?', publicationUri);
  if (documentUri)    add('document_uri = ?', documentUri);
  if (did)            add('did = ?', did);
  if (from !== null)  add('created_at >= ?', from);
  add('created_at <= ?', to);

  const where = conditions.join(' AND ');

  const [{ count: total }] = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM action_events WHERE ${where}`,
    params,
  );

  const events = await query<Record<string, unknown>>(
    `SELECT action_type, did, document_uri, publication_uri, origin, created_at
     FROM action_events WHERE ${where}
     ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return c.json({ events, total });
}
