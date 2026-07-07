import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../app.js';
import { db, actionEvents } from '../db.js';

const SECRET = process.env.NOTIFY_SECRET!;
const AUTH = { Authorization: `Bearer ${SECRET}` };
const PUBLICATION_URI = 'at://did:plc:author/site.standard.publication/abc';
const DOCUMENT_URI = 'at://did:plc:author/site.standard.document/doc1';

function get(query: string, headers: Record<string, string> = AUTH) {
  return app.request(`/events?${query}`, { headers });
}

beforeEach(() => {
  db.exec('DELETE FROM action_events');
});

describe('GET /events — auth', () => {
  it('rejects a missing Authorization header', async () => {
    const res = await get('action_type=recommend', {});
    expect(res.status).toBe(401);
  });

  it('rejects an incorrect secret', async () => {
    const res = await get('action_type=recommend', { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });
});

describe('GET /events — validation', () => {
  it('rejects a missing action_type', async () => {
    const res = await get('');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid action_type', async () => {
    const res = await get('action_type=not-a-real-type');
    expect(res.status).toBe(400);
  });

  it('rejects a publication_uri that is not an AT URI', async () => {
    const res = await get('action_type=recommend&publication_uri=https://example.com');
    expect(res.status).toBe(400);
  });

  it('rejects a document_uri that is not an AT URI', async () => {
    const res = await get('action_type=recommend&document_uri=https://example.com');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid date range (from after to)', async () => {
    const res = await get('action_type=recommend&from=1700000100&to=1700000000');
    expect(res.status).toBe(400);
  });
});

describe('GET /events — behaviour', () => {
  it('returns matching events for the given action_type and document_uri', async () => {
    actionEvents.log({
      actionType: 'recommend',
      documentUri: DOCUMENT_URI,
      origin: 'https://norobots.blog',
      did: 'did:plc:reader1',
    });
    actionEvents.log({
      actionType: 'share',
      documentUri: DOCUMENT_URI,
      origin: 'https://norobots.blog',
      did: 'did:plc:reader2',
    });

    const res = await get(`action_type=recommend&document_uri=${encodeURIComponent(DOCUMENT_URI)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<{ action_type: string; did: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ action_type: 'recommend', did: 'did:plc:reader1' });
  });

  it('filters by publication_uri for subscribe events', async () => {
    actionEvents.log({
      actionType: 'subscribe',
      publicationUri: PUBLICATION_URI,
      origin: 'https://norobots.blog',
      did: 'did:plc:subscriber1',
    });
    actionEvents.log({
      actionType: 'subscribe',
      publicationUri: 'at://did:plc:other/site.standard.publication/xyz',
      origin: 'https://norobots.blog',
      did: 'did:plc:subscriber2',
    });

    const res = await get(`action_type=subscribe&publication_uri=${encodeURIComponent(PUBLICATION_URI)}`);
    const body = (await res.json()) as { events: unknown[]; total: number };
    expect(body.total).toBe(1);
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 3; i++) {
      actionEvents.log({
        actionType: 'recommend',
        documentUri: DOCUMENT_URI,
        origin: 'https://norobots.blog',
        did: `did:plc:reader${i}`,
      });
    }

    const res = await get(`action_type=recommend&limit=2`);
    const body = (await res.json()) as { events: unknown[]; total: number };
    expect(body.total).toBe(3);
    expect(body.events).toHaveLength(2);
  });
});
