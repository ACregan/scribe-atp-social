import { describe, it, expect } from 'vitest';
import {
  signSessionId,
  verifySessionId,
  encodePending,
  decodePending,
  verifyBearerSecret,
  type PendingData,
} from './session.js';

describe('signSessionId / verifySessionId', () => {
  it('round-trips a valid signed id', () => {
    const signed = signSessionId('user-123');
    expect(verifySessionId(signed)).toBe('user-123');
  });

  it('rejects a tampered id (signature no longer matches)', () => {
    const signed = signSessionId('user-123');
    const tampered = signed.replace('user-123', 'user-456');
    expect(verifySessionId(tampered)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const signed = signSessionId('user-123');
    const dot = signed.lastIndexOf('.');
    const tampered = signed.slice(0, dot + 1) + 'not-the-real-signature';
    expect(verifySessionId(tampered)).toBeNull();
  });

  it('rejects a value with no signature separator', () => {
    expect(verifySessionId('no-dot-here')).toBeNull();
  });

  it('rejects a signature produced with a different secret', () => {
    // Simulates a token forged without knowledge of SESSION_SECRET.
    const forged = 'user-123.' + Buffer.from('garbage').toString('base64url');
    expect(verifySessionId(forged)).toBeNull();
  });
});

describe('encodePending / decodePending', () => {
  const data: PendingData = {
    action: 'subscribe',
    uri: 'at://did:plc:abc/site.standard.publication/xyz',
    origin: 'https://norobots.blog',
    title: 'NoRobots',
  };

  it('round-trips valid pending data', () => {
    const encoded = encodePending(data);
    expect(decodePending(encoded)).toEqual(data);
  });

  it('rejects tampered payload (signature no longer matches)', () => {
    const encoded = encodePending(data);
    const dot = encoded.lastIndexOf('.');
    const payload = encoded.slice(0, dot);
    const sig = encoded.slice(dot + 1);
    // Flip the payload's base64url content without recomputing the HMAC.
    const tamperedPayload = payload.slice(0, -1) + (payload.at(-1) === 'A' ? 'B' : 'A');
    expect(decodePending(`${tamperedPayload}.${sig}`)).toBeNull();
  });

  it('rejects a value with no signature separator', () => {
    expect(decodePending('no-dot-here')).toBeNull();
  });

  it('never throws on garbled input, even when the signature segment itself is malformed', () => {
    const encoded = encodePending(data);
    const dot = encoded.lastIndexOf('.');
    const garbled = `${encoded.slice(0, dot)}x.${encoded.slice(dot + 1)}`;
    expect(() => decodePending(garbled)).not.toThrow();
    expect(decodePending(garbled)).toBeNull();
  });
});

describe('verifyBearerSecret', () => {
  it('accepts a matching Bearer header', () => {
    expect(verifyBearerSecret('Bearer correct-secret', 'correct-secret')).toBe(true);
  });

  it('rejects a mismatched secret', () => {
    expect(verifyBearerSecret('Bearer wrong-secret', 'correct-secret')).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyBearerSecret('Bearer anything', undefined)).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    expect(verifyBearerSecret('', 'correct-secret')).toBe(false);
  });

  it('rejects a header missing the Bearer prefix', () => {
    expect(verifyBearerSecret('correct-secret', 'correct-secret')).toBe(false);
  });

  it('rejects secrets of different lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch — verifyBearerSecret must
    // catch that internally (via safeEqual) rather than propagate it.
    expect(() => verifyBearerSecret('Bearer short', 'a-much-longer-secret-value')).not.toThrow();
    expect(verifyBearerSecret('Bearer short', 'a-much-longer-secret-value')).toBe(false);
  });
});
