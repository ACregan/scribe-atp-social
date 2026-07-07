import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodePending, type PendingData } from '../session.js';

vi.mock('../oauth.js', () => ({
  oauthClient: { callback: vi.fn() },
}));

const { oauthClient } = await import('../oauth.js');
const { app } = await import('../app.js');

function pendingCookie(data: PendingData): string {
  return `scribe_pending=${encodePending(data)}`;
}

beforeEach(() => {
  vi.mocked(oauthClient.callback).mockReset();
});

describe('GET /callback', () => {
  it('rejects with a 400 error page when the OAuth exchange fails', async () => {
    vi.mocked(oauthClient.callback).mockRejectedValue(new Error('provider rejected'));

    const res = await app.request('/callback?code=abc&state=xyz');

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Authentication failed/);
  });

  it('sets a signed session cookie and redirects to /subscribe for a subscribe action', async () => {
    vi.mocked(oauthClient.callback).mockResolvedValue({
      session: { sub: 'did:plc:testuser' },
    } as never);

    const pending: PendingData = {
      action: 'subscribe',
      uri: 'at://did:plc:author/site.standard.publication/abc',
      origin: 'https://norobots.blog',
      title: 'NoRobots',
    };

    const res = await app.request('/callback?code=abc&state=xyz', {
      headers: { Cookie: pendingCookie(pending) },
      redirect: 'manual',
    });

    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toMatch(/^\/subscribe\?/);
    expect(location).toContain(encodeURIComponent(pending.uri));
    expect(location).toContain(encodeURIComponent(pending.origin));

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith('scribe_session='))).toBe(true);
    // The pending cookie must be cleared regardless of outcome.
    expect(setCookies.some((c) => c.startsWith('scribe_pending=') && /Max-Age=0|Expires=/.test(c))).toBe(true);
  });

  it('redirects to /recommend for a recommend action, carrying the token through', async () => {
    vi.mocked(oauthClient.callback).mockResolvedValue({
      session: { sub: 'did:plc:testuser' },
    } as never);

    const pending: PendingData = {
      action: 'recommend',
      uri: 'at://did:plc:author/site.standard.document/doc1',
      origin: 'https://norobots.blog',
      title: 'An Article',
      token: 'tok-123',
    };

    const res = await app.request('/callback?code=abc&state=xyz', {
      headers: { Cookie: pendingCookie(pending) },
      redirect: 'manual',
    });

    const location = res.headers.get('location')!;
    expect(location).toMatch(/^\/recommend\?/);
    expect(location).toContain('token=tok-123');
  });

  it('redirects to /unsubscribe for an unsubscribe action', async () => {
    vi.mocked(oauthClient.callback).mockResolvedValue({
      session: { sub: 'did:plc:testuser' },
    } as never);

    const pending: PendingData = {
      action: 'unsubscribe',
      uri: 'at://did:plc:author/site.standard.publication/abc',
      origin: 'https://norobots.blog',
      title: 'NoRobots',
    };

    const res = await app.request('/callback?code=abc&state=xyz', {
      headers: { Cookie: pendingCookie(pending) },
      redirect: 'manual',
    });

    expect(res.headers.get('location')).toMatch(/^\/unsubscribe\?/);
  });

  it('redirects to /share for a share action, including canonicalUrl and publication', async () => {
    vi.mocked(oauthClient.callback).mockResolvedValue({
      session: { sub: 'did:plc:testuser' },
    } as never);

    const pending: PendingData = {
      action: 'share',
      uri: 'at://did:plc:author/site.standard.document/doc1',
      origin: 'https://norobots.blog',
      title: 'An Article',
      canonicalUrl: 'https://norobots.blog/an-article',
      publication: 'at://did:plc:author/site.standard.publication/abc',
    };

    const res = await app.request('/callback?code=abc&state=xyz', {
      headers: { Cookie: pendingCookie(pending) },
      redirect: 'manual',
    });

    const location = res.headers.get('location')!;
    expect(location).toMatch(/^\/share\?/);
    expect(location).toContain(`canonicalUrl=${encodeURIComponent(pending.canonicalUrl!)}`);
    expect(location).toContain(`publication=${encodeURIComponent(pending.publication!)}`);
  });

  it('returns a 400 "session expired" page when there is no pending cookie, but still sets a session cookie', async () => {
    vi.mocked(oauthClient.callback).mockResolvedValue({
      session: { sub: 'did:plc:testuser' },
    } as never);

    const res = await app.request('/callback?code=abc&state=xyz');

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Session expired/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith('scribe_session='))).toBe(true);
  });

  it('returns a 400 "session expired" page when the pending cookie is tampered', async () => {
    vi.mocked(oauthClient.callback).mockResolvedValue({
      session: { sub: 'did:plc:testuser' },
    } as never);

    const res = await app.request('/callback?code=abc&state=xyz', {
      headers: { Cookie: 'scribe_pending=garbled.not-a-real-signature' },
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Session expired/);
  });
});
