import { describe, it, expect, afterEach, vi } from 'vitest';
import { app } from '../app.js';
import { clearWebsiteCheckCache } from '../websiteCheck.js';

const DOC = 'at://did:plc:author/site.standard.document/doc1';
const PUB = 'at://did:plc:author/site.standard.publication/pub1';

// The Publication's url is example.com, so a popup from it passes the
// website check.
function stubPublication() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.host === 'plc.directory') {
        return Response.json({ service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.example' }] });
      }
      return Response.json({ cid: 'cid', value: { url: 'https://example.com' } });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearWebsiteCheckCache();
});

describe('GET /share (ADR 0097 quick share)', () => {
  const url = (extra = '') =>
    `/share?document=${encodeURIComponent(DOC)}&publication=${encodeURIComponent(PUB)}&origin=${encodeURIComponent('https://example.com')}&title=Hi${extra}`;

  it('carries quick through the sign-in form', async () => {
    stubPublication();
    const html = await (await app.request(url('&quick=1'))).text();
    expect(html).toContain('name="quick" value="1"');
  });

  it("doesn't add it to an ordinary share", async () => {
    stubPublication();
    const html = await (await app.request(url())).text();
    expect(html).not.toContain('name="quick"');
  });
});

describe('shareConfirmPage', async () => {
  const { shareConfirmPage } = await import('../views.js');
  const page = (quick: boolean) =>
    String(
      shareConfirmPage({
        handle: 'reader.bsky.social',
        documentUri: DOC,
        publicationUri: PUB,
        canonicalUrl: 'https://example.com/a',
        defaultText: 'Hi https://example.com/a',
        origin: 'https://example.com',
        quick,
      }),
    );

  it('submits itself in quick mode, with the default text', () => {
    expect(page(true)).toContain('document.forms[0].submit()');
    expect(page(true)).toContain('Hi https://example.com/a');
  });

  it('waits for the reader otherwise', () => {
    expect(page(false)).not.toContain('document.forms[0].submit()');
  });
});
