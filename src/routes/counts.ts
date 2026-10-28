import type { Context } from 'hono';
import { query } from '../db.js';
import { parseDate, validateDateRange } from '../utils/parseDate.js';

const VALID_ACTION_TYPES = new Set(['recommend', 'subscribe', 'share']);
const VALID_GROUP_BY = new Set(['document_uri', 'did', 'day']);
const VALID_ORDER_BY = new Set(['count', 'date']);

// Simple in-memory sliding window rate limiter — 60 req/min per IP
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ipTimestamps = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (ipTimestamps.get(ip) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  ipTimestamps.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

export async function handleCounts(c: Context) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return c.json({ ok: false, error: 'Too many requests' }, 429);
  }

  const q = c.req.query();

  const actionType = q['action_type'];
  if (!actionType || !VALID_ACTION_TYPES.has(actionType)) {
    return c.json({ ok: false, error: 'action_type must be one of: recommend, subscribe, share' }, 400);
  }

  const publicationUri = q['publication_uri'];
  const documentUri = q['document_uri'];
  const origin = q['origin'];
  const groupBy = q['group_by'];
  const orderBy = q['order_by'] ?? 'count';
  const limit = Math.min(100, Math.max(1, parseInt(q['limit'] ?? '10', 10) || 10));

  if (publicationUri && !publicationUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'publication_uri must be an AT URI' }, 400);
  }
  if (documentUri && !documentUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'document_uri must be an AT URI' }, 400);
  }
  if (origin && !/^https?:\/\//.test(origin)) {
    return c.json({ ok: false, error: 'origin must be an http/https URL' }, 400);
  }
  if (groupBy && !VALID_GROUP_BY.has(groupBy)) {
    return c.json({ ok: false, error: 'group_by must be one of: document_uri, did, day' }, 400);
  }
  if (!VALID_ORDER_BY.has(orderBy)) {
    return c.json({ ok: false, error: 'order_by must be one of: count, date' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const from = q['from'] ? parseDate(q['from'], 0) : null;
  const to = q['to'] ? parseDate(q['to'], now) : now;

  if (from !== null) {
    const rangeError = validateDateRange(from, to);
    if (rangeError) return c.json({ ok: false, error: rangeError }, 400);
  }

  const params: (string | number)[] = [actionType];
  const conditions: string[] = ['action_type = $1'];
  // Each condition takes the next $n placeholder.
  const add = (sql: string, value: string | number) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (publicationUri) add('publication_uri = ?', publicationUri);
  if (documentUri)    add('document_uri = ?', documentUri);
  if (origin)         add('origin = ?', origin);
  if (from !== null)  add('created_at >= ?', from);
  add('created_at <= ?', to);

  const where = conditions.join(' AND ');

  if (!groupBy) {
    const [row] = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM action_events WHERE ${where}`,
      params,
    );
    return c.json({ count: row.count });
  }

  const groupCol = groupBy === 'day'
    ? "to_char(to_timestamp(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')"
    : groupBy;

  const orderClause = orderBy === 'date' ? 'key ASC' : 'count DESC';

  const [{ count: total }] = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM action_events WHERE ${where}`,
    params,
  );

  const groups = await query<{ key: string; count: number }>(
    `SELECT ${groupCol} AS key, COUNT(*) AS count
     FROM action_events WHERE ${where}
     GROUP BY ${groupCol} ORDER BY ${orderClause} LIMIT $${params.length + 1}`,
    [...params, limit],
  );

  return c.json({ groups, total });
}
