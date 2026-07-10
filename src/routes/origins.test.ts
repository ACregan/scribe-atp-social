import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../app.js';
import { db, allowedOrigins } from '../db.js';

const SECRET = process.env.NOTIFY_SECRET!;

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.request('/origins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.exec("DELETE FROM allowed_origins WHERE origin = 'https://newsite.example'");
});

const validBody = { origin: 'https://newsite.example', did: 'did:plc:owner1' };

describe('POST /origins — auth', () => {
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
    expect(res.status).toBe(200);
  });
});

describe('POST /origins — validation', () => {
  const auth = { Authorization: `Bearer ${SECRET}` };

  it('rejects an invalid JSON body', async () => {
    const res = await app.request('/origins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an origin with a path', async () => {
    const res = await post({ origin: 'https://newsite.example/blog', did: 'did:plc:owner1' }, auth);
    expect(res.status).toBe(400);
  });

  it('rejects a non-https origin', async () => {
    const res = await post({ origin: 'http://newsite.example', did: 'did:plc:owner1' }, auth);
    expect(res.status).toBe(400);
  });

  it('rejects a missing origin', async () => {
    const res = await post({ did: 'did:plc:owner1' }, auth);
    expect(res.status).toBe(400);
  });
});

describe('POST /origins — behaviour', () => {
  const auth = { Authorization: `Bearer ${SECRET}` };

  it('adds a new origin, immediately allowed afterwards', async () => {
    expect(allowedOrigins.isAllowed('https://newsite.example')).toBe(false);
    const res = await post(validBody, auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(allowedOrigins.isAllowed('https://newsite.example')).toBe(true);
  });

  it('is idempotent — registering the same origin twice does not error', async () => {
    await post(validBody, auth);
    const res = await post(validBody, auth);
    expect(res.status).toBe(200);
  });

  it('updates owner_did when the same origin is re-registered under a different did', async () => {
    await post(validBody, auth);
    await post({ origin: 'https://newsite.example', did: 'did:plc:newowner' }, auth);
    const row = db
      .prepare<string, { owner_did: string }>(
        'SELECT owner_did FROM allowed_origins WHERE origin = ?',
      )
      .get('https://newsite.example');
    expect(row?.owner_did).toBe('did:plc:newowner');
  });
});

describe('allowedOrigins — legacy seed data', () => {
  it('pre-seeds the origins that used to be hardcoded in ALLOWED_ORIGINS', () => {
    for (const origin of [
      'https://norobots.blog',
      'https://anthonycregan.co.uk',
      'https://www.anthonycregan.co.uk',
      'https://perpetualsummer.ltd',
      'https://www.perpetualsummer.ltd',
      'https://scribe-cms.app',
    ]) {
      expect(allowedOrigins.isAllowed(origin)).toBe(true);
    }
  });

  it('does not allow an origin that was never registered', () => {
    expect(allowedOrigins.isAllowed('https://never-registered.example')).toBe(false);
  });
});
