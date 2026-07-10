import { describe, it, expect, beforeEach } from 'vitest';
import { db, initiateAttempts, sessionStore, allowedOrigins } from './db.js';

// Each test file gets its own fresh `:memory:` database (see test/setup.ts),
// but tests within this file share one instance, so clear relevant tables
// between tests rather than relying on isolation across `it` blocks.
beforeEach(() => {
  db.exec('DELETE FROM initiate_attempts');
  db.exec('DELETE FROM sessions');
  db.exec("DELETE FROM allowed_origins WHERE origin = 'https://db-test.example'");
});

describe('initiateAttempts — 5 attempts / 15 minutes per IP', () => {
  it('is not limited before any attempts are recorded', () => {
    expect(initiateAttempts.isLimited('1.2.3.4')).toBe(false);
    expect(initiateAttempts.count('1.2.3.4')).toBe(0);
  });

  it('counts attempts per IP independently', () => {
    initiateAttempts.record('1.2.3.4');
    initiateAttempts.record('1.2.3.4');
    initiateAttempts.record('5.6.7.8');
    expect(initiateAttempts.count('1.2.3.4')).toBe(2);
    expect(initiateAttempts.count('5.6.7.8')).toBe(1);
  });

  it('is not limited at exactly 4 attempts (max is 5)', () => {
    for (let i = 0; i < 4; i++) initiateAttempts.record('1.2.3.4');
    expect(initiateAttempts.isLimited('1.2.3.4')).toBe(false);
  });

  it('becomes limited once 5 attempts are recorded within the window', () => {
    for (let i = 0; i < 5; i++) initiateAttempts.record('1.2.3.4');
    expect(initiateAttempts.isLimited('1.2.3.4')).toBe(true);
  });

  it('excludes attempts older than the 15-minute window', () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 901; // just past 900s window
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO initiate_attempts (ip, created_at) VALUES (?, ?)').run(
        '9.9.9.9',
        staleTimestamp,
      );
    }
    expect(initiateAttempts.count('9.9.9.9')).toBe(0);
    expect(initiateAttempts.isLimited('9.9.9.9')).toBe(false);
  });

  it('counts attempts still inside the window', () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 100;
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO initiate_attempts (ip, created_at) VALUES (?, ?)').run(
        '9.9.9.9',
        recentTimestamp,
      );
    }
    expect(initiateAttempts.count('9.9.9.9')).toBe(5);
    expect(initiateAttempts.isLimited('9.9.9.9')).toBe(true);
  });
});

describe('allowedOrigins', () => {
  it('add() works with no owner_did (legacy-seed shape)', () => {
    allowedOrigins.add('https://db-test.example');
    expect(allowedOrigins.isAllowed('https://db-test.example')).toBe(true);
    const row = db
      .prepare<string, { owner_did: string | null }>(
        'SELECT owner_did FROM allowed_origins WHERE origin = ?',
      )
      .get('https://db-test.example');
    expect(row?.owner_did).toBeNull();
  });

  it('add() preserves created_at across a re-registration that updates owner_did', () => {
    allowedOrigins.add('https://db-test.example', 'did:plc:first');
    const before = db
      .prepare<string, { created_at: number }>(
        'SELECT created_at FROM allowed_origins WHERE origin = ?',
      )
      .get('https://db-test.example');

    allowedOrigins.add('https://db-test.example', 'did:plc:second');
    const after = db
      .prepare<string, { created_at: number; owner_did: string }>(
        'SELECT created_at, owner_did FROM allowed_origins WHERE origin = ?',
      )
      .get('https://db-test.example');

    expect(after?.created_at).toBe(before?.created_at);
    expect(after?.owner_did).toBe('did:plc:second');
  });
});

describe('sessionStore', () => {
  it('creates a session and reads back the same did', () => {
    const id = sessionStore.create('did:plc:abc123');
    expect(sessionStore.get(id)).toBe('did:plc:abc123');
  });

  it('returns undefined for an unknown session id', () => {
    expect(sessionStore.get('does-not-exist')).toBeUndefined();
  });

  it('deletes a session so it can no longer be read', () => {
    const id = sessionStore.create('did:plc:abc123');
    sessionStore.delete(id);
    expect(sessionStore.get(id)).toBeUndefined();
  });
});
