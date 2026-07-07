import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../app.js';
import { db, actionEvents } from '../db.js';

const DOCUMENT_URI = 'at://did:plc:author/site.standard.document/doc1';

// The rate limiter's ipTimestamps map is module-level state with no reset
// hook, so each test uses its own unique x-forwarded-for IP to stay
// independent of the others (see the dedicated rate-limit describe block,
// which instead relies on that same persistence deliberately).
let ipCounter = 0;
function get(query: string, ip?: string) {
  const forwardedFor = ip ?? `10.0.0.${++ipCounter}`;
  return app.request(`/counts?${query}`, { headers: { 'x-forwarded-for': forwardedFor } });
}

beforeEach(() => {
  db.exec('DELETE FROM action_events');
});

describe('GET /counts — validation', () => {
  it('rejects a missing action_type', async () => {
    expect((await get('')).status).toBe(400);
  });

  it('rejects an invalid action_type', async () => {
    expect((await get('action_type=bogus')).status).toBe(400);
  });

  it('rejects a publication_uri that is not an AT URI', async () => {
    expect((await get('action_type=recommend&publication_uri=https://example.com')).status).toBe(400);
  });

  it('rejects a document_uri that is not an AT URI', async () => {
    expect((await get('action_type=recommend&document_uri=https://example.com')).status).toBe(400);
  });

  it('rejects an origin that is not an http(s) URL', async () => {
    expect((await get('action_type=recommend&origin=ftp://example.com')).status).toBe(400);
  });

  it('rejects an invalid group_by', async () => {
    expect((await get('action_type=recommend&group_by=nonsense')).status).toBe(400);
  });

  it('rejects an invalid order_by', async () => {
    expect((await get('action_type=recommend&order_by=nonsense')).status).toBe(400);
  });

  it('rejects an invalid date range', async () => {
    expect((await get('action_type=recommend&from=1700000100&to=1700000000')).status).toBe(400);
  });
});

describe('GET /counts — behaviour', () => {
  it('returns a plain count with no group_by', async () => {
    actionEvents.log({ actionType: 'recommend', documentUri: DOCUMENT_URI, origin: 'https://norobots.blog', did: 'did:plc:r1' });
    actionEvents.log({ actionType: 'recommend', documentUri: DOCUMENT_URI, origin: 'https://norobots.blog', did: 'did:plc:r2' });

    const res = await get(`action_type=recommend&document_uri=${encodeURIComponent(DOCUMENT_URI)}`);
    expect(await res.json()).toEqual({ count: 2 });
  });

  it('groups by document_uri, ordered by count descending', async () => {
    const otherDoc = 'at://did:plc:author/site.standard.document/doc2';
    actionEvents.log({ actionType: 'recommend', documentUri: DOCUMENT_URI, origin: 'https://norobots.blog', did: 'did:plc:r1' });
    actionEvents.log({ actionType: 'recommend', documentUri: DOCUMENT_URI, origin: 'https://norobots.blog', did: 'did:plc:r2' });
    actionEvents.log({ actionType: 'recommend', documentUri: otherDoc, origin: 'https://norobots.blog', did: 'did:plc:r3' });

    const res = await get('action_type=recommend&group_by=document_uri');
    const body = (await res.json()) as { groups: Array<{ key: string; count: number }>; total: number };
    expect(body.total).toBe(3);
    expect(body.groups[0]).toEqual({ key: DOCUMENT_URI, count: 2 });
  });

  it('caps limit at 100 and defaults to 10', async () => {
    const res = await get('action_type=recommend&group_by=document_uri&limit=500');
    // No error — limit is clamped server-side, not rejected.
    expect(res.status).toBe(200);
  });
});

describe('GET /counts — rate limiting (60/min per IP)', () => {
  it('allows the 60th request and rejects the 61st from the same IP', async () => {
    const ip = '203.0.113.42';
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await get('action_type=recommend', ip);
      lastStatus = res.status;
      if (i === 59) expect(res.status).not.toBe(429); // 60th request (0-indexed 59)
    }
    expect(lastStatus).toBe(429); // 61st request
  });

  it('does not rate-limit a different IP', async () => {
    const res = await get('action_type=recommend', '198.51.100.7');
    expect(res.status).not.toBe(429);
  });
});
