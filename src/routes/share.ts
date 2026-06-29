import type { Context } from 'hono';
import { Agent } from '@atproto/api';
import { ALLOWED_ORIGINS } from '../config.js';
import { getSessionDid } from '../auth.js';
import { oauthClient } from '../oauth.js';
import { completionTokens, actionEvents } from '../db.js';
import { handleForm, shareConfirmPage, successPage, errorPage } from '../views.js';

async function getAgentAndHandle(did: string): Promise<{ agent: Agent; handle: string } | null> {
  try {
    const session = await oauthClient.restore(did);
    const agent = new Agent(session);
    const desc = await agent.com.atproto.repo.describeRepo({ repo: did });
    return { agent, handle: desc.data.handle };
  } catch {
    return null;
  }
}

async function fetchAtRecordCid(atUri: string): Promise<string | null> {
  try {
    const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    const [, did, collection, rkey] = match;

    const didDocRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
    if (!didDocRes.ok) return null;
    const didDoc = await didDocRes.json() as { service?: Array<{ id: string; serviceEndpoint: string }> };
    const pds = didDoc.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint;
    if (!pds) return null;

    const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', collection);
    url.searchParams.set('rkey', rkey);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as { cid?: string };
    return data.cid ?? null;
  } catch {
    return null;
  }
}

export async function handleShare(c: Context) {
  const documentUri = c.req.query('document') ?? '';
  const publicationUri = c.req.query('publication') ?? '';
  const canonicalUrl = c.req.query('canonicalUrl') ?? '';
  const origin = c.req.query('origin') ?? '';
  const title = c.req.query('title') ?? '';
  const token = c.req.query('token') || undefined;

  if (!ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])) {
    return c.text('Invalid origin', 400);
  }
  if (!documentUri.startsWith('at://')) {
    return c.text('Invalid document URI', 400);
  }

  const did = getSessionDid(c);

  if (!did) {
    return c.html(
      handleForm({
        heading: title ? `Share "${title}"` : 'Share this article',
        subtitle: 'Sign in with your Bluesky account to share this article.',
        action: 'share',
        uri: documentUri,
        origin,
        title,
        token,
        canonicalUrl,
        publication: publicationUri,
      })
    );
  }

  const result = await getAgentAndHandle(did);
  if (!result) {
    c.header('Set-Cookie', `scribe_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`);
    return c.html(
      handleForm({
        heading: title ? `Share "${title}"` : 'Share this article',
        subtitle: 'Sign in with your Bluesky account to share this article.',
        action: 'share',
        uri: documentUri,
        origin,
        title,
        token,
        canonicalUrl,
        publication: publicationUri,
        error: 'Your session expired. Please sign in again.',
      })
    );
  }

  const { handle } = result;
  const defaultText = title && canonicalUrl ? `${title} ${canonicalUrl}` : canonicalUrl || title;

  return c.html(
    shareConfirmPage({ handle, documentUri, publicationUri, canonicalUrl, defaultText, origin, token })
  );
}

export async function handleSharePost(c: Context) {
  const body = await c.req.parseBody();
  const documentUri = (body.document as string) ?? '';
  const publicationUri = (body.publication as string) ?? '';
  const canonicalUrl = (body.canonicalUrl as string) ?? '';
  const text = (body.text as string) ?? '';
  const origin = (body.origin as string) ?? '';
  const token = (body.token as string) || undefined;

  if (!ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])) {
    return c.text('Invalid origin', 400);
  }
  if (!documentUri.startsWith('at://')) {
    return c.text('Invalid document URI', 400);
  }
  if (!text.trim()) {
    return c.html(errorPage('Post text cannot be empty.'));
  }

  const did = getSessionDid(c);
  if (!did) {
    return c.html(errorPage('Session not found. Please close this window and try again.'));
  }

  const result = await getAgentAndHandle(did);
  if (!result) {
    return c.html(errorPage('Session expired. Please close this window and try again.'));
  }

  const { agent } = result;

  // Fetch CIDs for associatedRefs (non-fatal — post is created even if lookup fails)
  const [docCid, pubCid] = await Promise.all([
    fetchAtRecordCid(documentUri),
    publicationUri.startsWith('at://') ? fetchAtRecordCid(publicationUri) : Promise.resolve(null),
  ]);

  const external: Record<string, unknown> = {
    uri: canonicalUrl,
    title: '',
    description: '',
  };

  if (docCid && pubCid) {
    external.associatedRefs = [
      { $type: 'com.atproto.repo.strongRef', uri: documentUri, cid: docCid },
      { $type: 'com.atproto.repo.strongRef', uri: publicationUri, cid: pubCid },
    ];
  }

  try {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: text.trim(),
        embed: { $type: 'app.bsky.embed.external', external },
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Missing required scope')) {
      // Session pre-dates the app.bsky.feed.post scope — clear it and prompt re-auth
      c.header('Set-Cookie', `scribe_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`);
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const canonicalParam = canonicalUrl ? `&canonicalUrl=${encodeURIComponent(canonicalUrl)}` : '';
      const pubParam = publicationUri ? `&publication=${encodeURIComponent(publicationUri)}` : '';
      return c.redirect(
        `/share?document=${encodeURIComponent(documentUri)}&origin=${encodeURIComponent(origin)}&title=${encodeURIComponent('')}${canonicalParam}${pubParam}${tokenParam}`
      );
    }
    return c.html(errorPage(`Could not create post: ${message}`));
  }

  actionEvents.log('share', documentUri, did);
  if (token) completionTokens.store(token, 'share');

  return c.html(successPage({ action: 'share', origin }));
}
