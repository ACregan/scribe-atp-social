import { describe, it, expect } from 'vitest';
import { followedPublication, likedDocument } from './graphRecords.js';

describe('graph record fields', () => {
  it("reads the spec's field, and the old subject field", () => {
    expect(followedPublication({ publication: 'at://a/p/1' })).toBe('at://a/p/1');
    expect(followedPublication({ subject: 'at://a/p/1' })).toBe('at://a/p/1');
    expect(likedDocument({ document: 'at://a/d/1' })).toBe('at://a/d/1');
    expect(likedDocument({ subject: 'at://a/d/1' })).toBe('at://a/d/1');
  });

  it('prefers the spec field and ignores non-strings', () => {
    expect(followedPublication({ publication: 'at://new', subject: 'at://old' })).toBe('at://new');
    expect(likedDocument({ document: 42 })).toBeUndefined();
  });
});
