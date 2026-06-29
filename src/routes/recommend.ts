import type { Context } from 'hono';
import { Agent } from '@atproto/api';
import { ALLOWED_ORIGINS } from '../config.js';
import { getSessionDid } from '../auth.js';
import { oauthClient } from '../oauth.js';
import { completionTokens, actionEvents } from '../db.js';
import { handleForm, confirmPage, alreadyActioned, successPage, errorPage } from '../views.js';

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

async function hasExistingRecommend(agent: Agent, did: string, documentUri: string): Promise<boolean> {
  try {
    let cursor: string | undefined;
    do {
      const res = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'site.standard.graph.recommend',
        limit: 100,
        cursor,
      });
      if (res.data.records.some((r) => (r.value as { subject?: string }).subject === documentUri)) {
        return true;
      }
      cursor = res.data.cursor;
    } while (cursor);
    return false;
  } catch {
    return false;
  }
}

export async function handleRecommend(c: Context) {
  const documentUri = c.req.query('document') ?? '';
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
        heading: title ? `Like "${title}"` : 'Like this article',
        subtitle: 'Sign in with your Bluesky account to like this article.',
        action: 'recommend',
        uri: documentUri,
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
        heading: title ? `Like "${title}"` : 'Like this article',
        subtitle: 'Sign in with your Bluesky account to like this article.',
        action: 'recommend',
        uri: documentUri,
        origin,
        title,
        token,
        error: 'Your session expired. Please sign in again.',
      })
    );
  }

  const { agent, handle } = result;

  if (await hasExistingRecommend(agent, did, documentUri)) {
    return c.html(alreadyActioned({ action: 'recommend', title }));
  }

  return c.html(confirmPage({ action: 'recommend', handle, uri: documentUri, origin, title, token }));
}

export async function handleRecommendPost(c: Context) {
  const body = await c.req.parseBody();
  const documentUri = (body.document as string) ?? '';
  const origin = (body.origin as string) ?? '';
  const token = (body.token as string) || undefined;

  if (!ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])) {
    return c.text('Invalid origin', 400);
  }
  if (!documentUri.startsWith('at://')) {
    return c.text('Invalid document URI', 400);
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

  if (await hasExistingRecommend(agent, did, documentUri)) {
    return c.html(alreadyActioned({ action: 'recommend', title: '' }));
  }

  try {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'site.standard.graph.recommend',
      record: {
        $type: 'site.standard.graph.recommend',
        subject: documentUri,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.html(errorPage(`Could not create record: ${message}`));
  }

  actionEvents.log('recommend', documentUri, did);
  if (token) completionTokens.store(token, 'recommend');

  return c.html(successPage({ action: 'recommend', origin }));
}
