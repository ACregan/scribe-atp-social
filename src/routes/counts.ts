import type { Context } from 'hono';
import { db } from '../db.js';
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

export function handleCounts(c: Context) {
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
  const groupBy = q['group_by'];
  const orderBy = q['order_by'] ?? 'count';
  const limit = Math.min(100, Math.max(1, parseInt(q['limit'] ?? '10', 10) || 10));

  if (publicationUri && !publicationUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'publication_uri must be an AT URI' }, 400);
  }
  if (documentUri && !documentUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'document_uri must be an AT URI' }, 400);
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

  const conditions: string[] = ['action_type = ?'];
  const params: (string | number)[] = [actionType];

  if (publicationUri) { conditions.push('publication_uri = ?'); params.push(publicationUri); }
  if (documentUri)    { conditions.push('document_uri = ?');    params.push(documentUri); }
  if (from !== null)  { conditions.push('created_at >= ?');     params.push(from); }
  conditions.push('created_at <= ?'); params.push(to);

  const where = conditions.join(' AND ');

  if (!groupBy) {
    const row = db.prepare<(string | number)[], { count: number }>(
      `SELECT COUNT(*) as count FROM action_events WHERE ${where}`
    ).get(...params) as { count: number };
    return c.json({ count: row.count });
  }

  const groupCol = groupBy === 'day'
    ? "strftime('%Y-%m-%d', created_at, 'unixepoch')"
    : groupBy;

  const orderClause = orderBy === 'date' ? 'key ASC' : 'count DESC';

  const total = (db.prepare<(string | number)[], { count: number }>(
    `SELECT COUNT(*) as count FROM action_events WHERE ${where}`
  ).get(...params) as { count: number }).count;

  const groups = db.prepare<(string | number)[], { key: string; count: number }>(
    `SELECT ${groupCol} as key, COUNT(*) as count
     FROM action_events WHERE ${where}
     GROUP BY ${groupCol} ORDER BY ${orderClause} LIMIT ?`
  ).all(...params, limit);

  return c.json({ groups, total });
}
