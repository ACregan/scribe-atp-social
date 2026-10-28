import { fetchAtRecord } from './utils/atRecord.js';

// A button must be on its own Publication's website (ADR 0097 decision 5 in
// skyscribe-app). This replaced an origin allowlist: a popup reports its
// website's origin itself, so the allowlist never stopped another website
// using the buttons, and it never tied a website to a Publication.
//
// The origin matches when its host is the Publication's `url` host, or when
// skyscribe-app resolves it to a SkyScribe Site showing that Publication
// (subdomain, Custom Domain or Previous Address). `www.` and the bare domain
// count as the same site.

const MATCH_TTL_MS = 10 * 60 * 1000;
// Short, so fixing a Publication's url takes effect quickly.
const MISMATCH_TTL_MS = 60 * 1000;
const cache = new Map<string, { ok: boolean; expires: number }>();

export function clearWebsiteCheckCache() {
  cache.clear();
}

function siteHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function originHost(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url.hostname;
  // Local development of an SDK site or skyscribe-site.
  if (process.env.NODE_ENV !== 'production' && url.protocol === 'http:') return url.hostname;
  return null;
}

// A Document names its Publication in `site`: an at:// uri, or for a
// Document with no Publication record, the website's own https:// URL.
async function siteOfDocument(documentUri: string): Promise<string | null> {
  const record = await fetchAtRecord(documentUri);
  const site = record?.value.site;
  return typeof site === 'string' ? site : null;
}

async function resolvesToPublication(host: string, publicationUri: string): Promise<boolean> {
  const appUrl = process.env.SKYSCRIBE_APP_URL;
  const secret = process.env.SOCIAL_RESOLVE_SECRET;
  if (!appUrl || !secret) return false;
  try {
    const res = await fetch(`${appUrl}/internal/site-resolve/host/${encodeURIComponent(host)}`, {
      headers: { 'X-Site-Resolve-Secret': secret },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { publicationUri?: string | null; removed?: boolean };
    return !body.removed && body.publicationUri === publicationUri;
  } catch {
    return false;
  }
}

async function check(host: string, site: string): Promise<boolean> {
  if (!site.startsWith('at://')) {
    const siteUrlHost = hostOf(site);
    return siteUrlHost !== null && siteHost(siteUrlHost) === siteHost(host);
  }
  const publication = await fetchAtRecord(site);
  const url = publication?.value.url;
  if (typeof url === 'string') {
    const urlHost = hostOf(url);
    if (urlHost && siteHost(urlHost) === siteHost(host)) return true;
  }
  return resolvesToPublication(host, site);
}

export async function websiteMatches(opts: {
  origin: string;
  publicationUri?: string;
  documentUri?: string;
}): Promise<boolean> {
  const host = originHost(opts.origin);
  if (!host) return false;

  const site =
    opts.publicationUri ||
    (opts.documentUri ? await siteOfDocument(opts.documentUri) : null);
  if (!site) return false;

  const key = `${siteHost(host)} ${site}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.ok;

  const ok = await check(host, site);
  cache.set(key, { ok, expires: Date.now() + (ok ? MATCH_TTL_MS : MISMATCH_TTL_MS) });
  return ok;
}
