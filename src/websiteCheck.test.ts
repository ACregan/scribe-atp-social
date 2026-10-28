import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { websiteMatches, clearWebsiteCheckCache } from './websiteCheck.js';

const AUTHOR = 'did:plc:author';
const PUB = `at://${AUTHOR}/site.standard.publication/pub1`;
const DOC = `at://${AUTHOR}/site.standard.document/doc1`;
const PDS = 'https://pds.example';

type Records = Record<string, Record<string, unknown>>;

// Answers plc.directory, the PDS's getRecord and skyscribe-app's resolve
// endpoint from fixtures; anything else 404s.
function stubNetwork(records: Records, resolve: Record<string, unknown> = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url.toString());
      if (url.host === 'plc.directory') {
        return Response.json({ service: [{ id: '#atproto_pds', serviceEndpoint: PDS }] });
      }
      if (url.origin === PDS && url.pathname === '/xrpc/com.atproto.repo.getRecord') {
        const uri = `at://${url.searchParams.get('repo')}/${url.searchParams.get('collection')}/${url.searchParams.get('rkey')}`;
        const value = records[uri];
        return value ? Response.json({ cid: 'cid', value }) : new Response(null, { status: 404 });
      }
      if (url.origin === 'https://app.example' && url.pathname.startsWith('/internal/site-resolve/host/')) {
        const headers = new Headers(init?.headers);
        if (headers.get('X-Site-Resolve-Secret') !== 'resolve-secret') {
          return new Response(null, { status: 401 });
        }
        const host = decodeURIComponent(url.pathname.split('/').pop()!);
        const body = resolve[host];
        return body ? Response.json(body) : new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return calls;
}

beforeEach(() => {
  clearWebsiteCheckCache();
  process.env.SKYSCRIBE_APP_URL = 'https://app.example';
  process.env.SOCIAL_RESOLVE_SECRET = 'resolve-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('websiteMatches', () => {
  it("accepts the Publication's own url, ignoring www. and the path", async () => {
    stubNetwork({ [PUB]: { url: 'https://www.example.com/blog' } });
    expect(await websiteMatches({ origin: 'https://example.com', publicationUri: PUB })).toBe(true);
    expect(await websiteMatches({ origin: 'https://www.example.com', publicationUri: PUB })).toBe(
      true,
    );
  });

  it('refuses another website', async () => {
    stubNetwork({ [PUB]: { url: 'https://example.com' } });
    expect(await websiteMatches({ origin: 'https://evil.example', publicationUri: PUB })).toBe(
      false,
    );
  });

  it('accepts a SkyScribe Site hostname that resolves to the Publication', async () => {
    stubNetwork(
      { [PUB]: { url: 'https://example.com' } },
      { 'old-name.skyscribe.site': { publicationUri: PUB } },
    );
    expect(
      await websiteMatches({ origin: 'https://old-name.skyscribe.site', publicationUri: PUB }),
    ).toBe(true);
  });

  it('refuses a SkyScribe Site showing another Publication, or a removed one', async () => {
    stubNetwork(
      { [PUB]: { url: 'https://example.com' } },
      {
        'other.skyscribe.site': { publicationUri: `at://${AUTHOR}/site.standard.publication/other` },
        'gone.skyscribe.site': { publicationUri: PUB, removed: true },
      },
    );
    expect(
      await websiteMatches({ origin: 'https://other.skyscribe.site', publicationUri: PUB }),
    ).toBe(false);
    expect(
      await websiteMatches({ origin: 'https://gone.skyscribe.site', publicationUri: PUB }),
    ).toBe(false);
  });

  it("finds a Like's Publication from the Document's site", async () => {
    stubNetwork({ [DOC]: { site: PUB }, [PUB]: { url: 'https://example.com' } });
    expect(await websiteMatches({ origin: 'https://example.com', documentUri: DOC })).toBe(true);
  });

  it("compares a Document's https site directly when it has no Publication record", async () => {
    stubNetwork({ [DOC]: { site: 'https://example.com' } });
    expect(await websiteMatches({ origin: 'https://example.com', documentUri: DOC })).toBe(true);
    expect(await websiteMatches({ origin: 'https://evil.example', documentUri: DOC })).toBe(false);
  });

  it('refuses plain http in production, and an origin that is not a URL', async () => {
    stubNetwork({ [PUB]: { url: 'http://example.com' } });
    vi.stubEnv('NODE_ENV', 'production');
    expect(await websiteMatches({ origin: 'http://example.com', publicationUri: PUB })).toBe(false);
    expect(await websiteMatches({ origin: 'not a url', publicationUri: PUB })).toBe(false);
  });

  it('caches the answer', async () => {
    const calls = stubNetwork({ [PUB]: { url: 'https://example.com' } });
    await websiteMatches({ origin: 'https://example.com', publicationUri: PUB });
    const after = calls.length;
    await websiteMatches({ origin: 'https://example.com', publicationUri: PUB });
    expect(calls.length).toBe(after);
  });
});
