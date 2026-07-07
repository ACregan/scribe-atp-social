import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../app.js';
import { db, actionEvents } from '../db.js';

const SECRET = process.env.NOTIFY_SECRET!;
const PUBLICATION_URI = 'at://did:plc:author/site.standard.publication/abc';

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.request('/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.exec('DELETE FROM action_events');
  delete process.env.AUTHOR_HANDLE;
  delete process.env.AUTHOR_APP_PASSWORD;
});

const validBody = {
  publicationUri: PUBLICATION_URI,
  siteTitle: 'NoRobots',
  articleTitle: 'An Article',
  canonicalUrl: 'https://norobots.blog/an-article',
  origin: 'https://norobots.blog',
};

describe('POST /notify — auth', () => {
  it('rejects a missing Authorization header', async () => {
    const res = await post(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects an incorrect secret', async () => {
    const res = await post(validBody, { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('accepts the correct secret', async () => {
    const res = await post(validBody, { Authorization: `Bearer ${SECRET}` });
    expect(res.status).not.toBe(401);
  });
});

describe('POST /notify — validation', () => {
  const auth = { Authorization: `Bearer ${SECRET}` };

  it('rejects an invalid JSON body', async () => {
    const res = await app.request('/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a publicationUri that is not an AT URI', async () => {
    const res = await post({ ...validBody, publicationUri: 'https://not-an-at-uri' }, auth);
    expect(res.status).toBe(400);
  });

  it('rejects a missing articleTitle', async () => {
    const res = await post({ ...validBody, articleTitle: '' }, auth);
    expect(res.status).toBe(400);
  });

  it('rejects a missing canonicalUrl', async () => {
    const res = await post({ ...validBody, canonicalUrl: '' }, auth);
    expect(res.status).toBe(400);
  });
});

describe('POST /notify — behaviour', () => {
  const auth = { Authorization: `Bearer ${SECRET}` };

  it('returns sent:0, skipped:0 immediately when there are no subscribers', async () => {
    const res = await post(validBody, auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 0, skipped: 0 });
  });

  it('fails with 500 when subscribers exist but author credentials are not configured', async () => {
    actionEvents.log({
      actionType: 'subscribe',
      publicationUri: PUBLICATION_URI,
      origin: 'https://norobots.blog',
      did: 'did:plc:subscriber1',
    });

    const res = await post(validBody, auth);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'Author credentials not configured' });
  });

  it('does not count a did whose latest action is unsubscribe as an active subscriber', async () => {
    // created_at is second-resolution (unixepoch()) — inserting both rows
    // via actionEvents.log() back-to-back can tie, which makes the route's
    // "latest action wins" bare-column MAX() query order-ambiguous rather
    // than deterministic (a real fragility, flagged separately). Insert
    // with explicit, clearly-ordered timestamps so this test exercises the
    // intended "unsubscribe happened after subscribe" case unambiguously.
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO action_events (action_type, subject_uri, publication_uri, origin, did, created_at)
       VALUES ('subscribe', ?, ?, ?, ?, ?)`,
    ).run(PUBLICATION_URI, PUBLICATION_URI, 'https://norobots.blog', 'did:plc:subscriber1', now - 10);
    db.prepare(
      `INSERT INTO action_events (action_type, subject_uri, publication_uri, origin, did, created_at)
       VALUES ('unsubscribe', ?, ?, ?, ?, ?)`,
    ).run(PUBLICATION_URI, PUBLICATION_URI, 'https://norobots.blog', 'did:plc:subscriber1', now);

    const res = await post(validBody, auth);

    // No active subscribers left, so this returns immediately (200) rather
    // than reaching the author-credentials check (which would 500).
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 0, skipped: 0 });
  });
});
