import type { Context } from 'hono';
import { Agent } from '@atproto/api';
import { getSessionDid } from '../auth.js';
import { oauthClient } from '../oauth.js';
import { allowedOrigins, completionTokens, actionEvents } from '../db.js';
import { handleForm, unsubscribeConfirmPage, successPage, errorPage } from '../views.js';

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

async function findSubscriptionRkey(agent: Agent, did: string, publicationUri: string): Promise<string | null> {
  try {
    let cursor: string | undefined;
    do {
      const res = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'site.standard.graph.subscription',
        limit: 100,
        cursor,
      });
      const record = res.data.records.find(
        (r) => (r.value as { subject?: string }).subject === publicationUri
      );
      if (record) {
        return record.uri.split('/').pop() ?? null;
      }
      cursor = res.data.cursor;
    } while (cursor);
    return null;
  } catch {
    return null;
  }
}

export async function handleUnsubscribe(c: Context) {
  const publicationUri = c.req.query('publication') ?? '';
  const origin = c.req.query('origin') ?? '';
  const title = c.req.query('title') ?? '';
  const token = c.req.query('token') || undefined;

  if (!allowedOrigins.isAllowed(origin)) {
    return c.text('Invalid origin', 400);
  }
  if (!publicationUri.startsWith('at://')) {
    return c.text('Invalid publication URI', 400);
  }

  const did = getSessionDid(c);

  if (!did) {
    return c.html(
      handleForm({
        heading: title ? `Unsubscribe from ${title}` : 'Unsubscribe',
        subtitle: 'Sign in with your Bluesky account to confirm your unsubscription.',
        action: 'unsubscribe',
        uri: publicationUri,
        origin,
        title,
        token,
      })
    );
  }

  const result = await getAgentAndHandle(did);
  if (!result) {
    c.header('Set-Cookie', `scribe_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`);
    return c.html(
      handleForm({
        heading: title ? `Unsubscribe from ${title}` : 'Unsubscribe',
        subtitle: 'Sign in with your Bluesky account to confirm your unsubscription.',
        action: 'unsubscribe',
        uri: publicationUri,
        origin,
        title,
        token,
        error: 'Your session expired. Please sign in again.',
      })
    );
  }

  const { handle } = result;
  return c.html(unsubscribeConfirmPage({ handle, publicationUri, origin, title, token }));
}

export async function handleUnsubscribePost(c: Context) {
  const body = await c.req.parseBody();
  const publicationUri = (body.publication as string) ?? '';
  const origin = (body.origin as string) ?? '';
  const token = (body.token as string) || undefined;

  if (!allowedOrigins.isAllowed(origin)) {
    return c.text('Invalid origin', 400);
  }
  if (!publicationUri.startsWith('at://')) {
    return c.text('Invalid publication URI', 400);
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

  const rkey = await findSubscriptionRkey(agent, did, publicationUri);
  if (!rkey) {
    return c.html(errorPage('No subscription found for this publication.'));
  }

  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: 'site.standard.graph.subscription',
      rkey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.html(errorPage(`Could not delete subscription: ${message}`));
  }

  actionEvents.log({ actionType: 'unsubscribe', publicationUri, origin, did });
  if (token) completionTokens.store(token, 'unsubscribe');

  return c.html(successPage({ action: 'unsubscribe', origin }));
}
