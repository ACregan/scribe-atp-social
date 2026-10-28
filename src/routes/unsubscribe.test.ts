import { describe, it, expect, afterEach, vi } from 'vitest';
import { app } from '../app.js';

const PUB = 'at://did:plc:author/site.standard.publication/pub1';

afterEach(() => {
  vi.unstubAllGlobals();
});

// The unfollow link in a Follower Notification DM opens in a tab with no
// website origin; a website's popup always sends one.
describe('GET /unfollow', () => {
  it('asks a signed-out reader to sign in when opened from a DM link (no origin)', async () => {
    const res = await app.request(`/unfollow?publication=${encodeURIComponent(PUB)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Sign in with your Bluesky account to unfollow.');
  });

  it("refuses a popup from a website that isn't the Publication's", async () => {
    // The Publication's record can't be fetched, so nothing matches.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const res = await app.request(
      `/unfollow?publication=${encodeURIComponent(PUB)}&origin=${encodeURIComponent('https://evil.example')}`,
    );
    expect(res.status).toBe(403);
  });

  it('serves the old /unsubscribe path too', async () => {
    const res = await app.request(`/unsubscribe?publication=${encodeURIComponent(PUB)}`);
    expect(res.status).toBe(200);
  });
});
