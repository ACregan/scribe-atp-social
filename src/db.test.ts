import { describe, it, expect, beforeEach } from 'vitest';
import { query, initiateAttempts, sessionStore } from './db.js';

// Each test file gets its own fresh `:memory:` database (see test/setup.ts),
// but tests within this file share one instance, so clear relevant tables
// between tests rather than relying on isolation across `it` blocks.
beforeEach(async () => {
  await query('DELETE FROM initiate_attempts');
  await query('DELETE FROM sessions');
});

describe('initiateAttempts — 5 attempts / 15 minutes per IP', () => {
  it('is not limited before any attempts are recorded', async () => {
    expect(await initiateAttempts.isLimited('1.2.3.4')).toBe(false);
    expect(await initiateAttempts.count('1.2.3.4')).toBe(0);
  });

  it('counts attempts per IP independently', async () => {
    await initiateAttempts.record('1.2.3.4');
    await initiateAttempts.record('1.2.3.4');
    await initiateAttempts.record('5.6.7.8');
    expect(await initiateAttempts.count('1.2.3.4')).toBe(2);
    expect(await initiateAttempts.count('5.6.7.8')).toBe(1);
  });

  it('is not limited at exactly 4 attempts (max is 5)', async () => {
    for (let i = 0; i < 4; i++) await initiateAttempts.record('1.2.3.4');
    expect(await initiateAttempts.isLimited('1.2.3.4')).toBe(false);
  });

  it('becomes limited once 5 attempts are recorded within the window', async () => {
    for (let i = 0; i < 5; i++) await initiateAttempts.record('1.2.3.4');
    expect(await initiateAttempts.isLimited('1.2.3.4')).toBe(true);
  });

  it('excludes attempts older than the 15-minute window', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 901; // just past 900s window
    for (let i = 0; i < 5; i++) {
      await query('INSERT INTO initiate_attempts (ip, created_at) VALUES ($1, $2)', ['9.9.9.9',
        staleTimestamp]);
    }
    expect(await initiateAttempts.count('9.9.9.9')).toBe(0);
    expect(await initiateAttempts.isLimited('9.9.9.9')).toBe(false);
  });

  it('counts attempts still inside the window', async () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 100;
    for (let i = 0; i < 5; i++) {
      await query('INSERT INTO initiate_attempts (ip, created_at) VALUES ($1, $2)', ['9.9.9.9',
        recentTimestamp]);
    }
    expect(await initiateAttempts.count('9.9.9.9')).toBe(5);
    expect(await initiateAttempts.isLimited('9.9.9.9')).toBe(true);
  });
});

describe('sessionStore', () => {
  it('creates a session and reads back the same did', async () => {
    const id = await sessionStore.create('did:plc:abc123');
    expect(await sessionStore.get(id)).toBe('did:plc:abc123');
  });

  it('returns undefined for an unknown session id', async () => {
    expect(await sessionStore.get('does-not-exist')).toBeUndefined();
  });

  it('deletes a session so it can no longer be read', async () => {
    const id = await sessionStore.create('did:plc:abc123');
    await sessionStore.delete(id);
    expect(await sessionStore.get(id)).toBeUndefined();
  });
});
