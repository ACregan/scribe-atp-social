import { describe, it, expect } from 'vitest';
import { parseDate, validateDateRange } from './parseDate.js';

describe('parseDate', () => {
  it('parses a relative "-Nd" value as N days before now', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = parseDate('-7d', 0);
    expect(result).toBeCloseTo(now - 7 * 86400, -1); // within ~10s
  });

  it('parses a plain integer string as a Unix timestamp in seconds', () => {
    expect(parseDate('1700000000', 0)).toBe(1700000000);
  });

  it('parses an ISO date string', () => {
    expect(parseDate('2026-01-01T00:00:00Z', 0)).toBe(
      Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000),
    );
  });

  it('falls back to the provided default for unparseable input', () => {
    expect(parseDate('not-a-date', 42)).toBe(42);
  });
});

describe('validateDateRange', () => {
  it('rejects a range where from is not before to', () => {
    expect(validateDateRange(100, 100)).toMatch(/before/);
    expect(validateDateRange(200, 100)).toMatch(/before/);
  });

  it('rejects a range spanning more than 90 days', () => {
    const from = 0;
    const to = 91 * 24 * 60 * 60;
    expect(validateDateRange(from, to)).toMatch(/90 days/);
  });

  it('accepts a valid range within 90 days', () => {
    const from = 0;
    const to = 30 * 24 * 60 * 60;
    expect(validateDateRange(from, to)).toBeNull();
  });

  it('accepts exactly 90 days as the boundary', () => {
    const from = 0;
    const to = 90 * 24 * 60 * 60;
    expect(validateDateRange(from, to)).toBeNull();
  });
});
