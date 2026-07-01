import type { Context } from 'hono';
import { AtpAgent } from '@atproto/api';
import { db } from '../db.js';

interface NotifyBody {
  publicationUri?: unknown;
  siteTitle?: unknown;
  articleTitle?: unknown;
  canonicalUrl?: unknown;
  origin?: unknown;
}

function getActiveSubscriberDids(publicationUri: string): string[] {
  const rows = db
    .prepare<
      string,
      { did: string; action_type: string }
    >(
      `SELECT did, action_type FROM (
         SELECT did, action_type, MAX(created_at) AS latest
         FROM action_events
         WHERE publication_uri = ?
           AND action_type IN ('subscribe', 'unsubscribe')
         GROUP BY did
       ) WHERE action_type = 'subscribe'`
    )
    .all(publicationUri);
  return rows.map((r) => r.did);
}

async function getOrCreateConvoId(agent: AtpAgent, memberDid: string): Promise<string> {
  const res = await agent.api.chat.bsky.convo.getConvoForMembers(
    { members: [memberDid] },
    { headers: { 'Atproto-Proxy': 'did:web:api.bsky.chat#bsky_chat' } }
  );
  return res.data.convo.id;
}

async function sendDm(agent: AtpAgent, convoId: string, text: string): Promise<void> {
  await agent.api.chat.bsky.convo.sendMessage(
    { convoId, message: { $type: 'chat.bsky.convo.defs#messageInput', text } },
    { headers: { 'Atproto-Proxy': 'did:web:api.bsky.chat#bsky_chat' } }
  );
}

export async function handleNotify(c: Context) {
  const authHeader = c.req.header('Authorization') ?? '';
  const secret = process.env.NOTIFY_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let body: NotifyBody;
  try {
    body = await c.req.json<NotifyBody>();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const publicationUri = typeof body.publicationUri === 'string' ? body.publicationUri : '';
  const siteTitle = typeof body.siteTitle === 'string' ? body.siteTitle : '';
  const articleTitle = typeof body.articleTitle === 'string' ? body.articleTitle : '';
  const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl : '';
  const origin = typeof body.origin === 'string' ? body.origin : '';

  if (!publicationUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'Invalid publicationUri' }, 400);
  }
  if (!articleTitle || !canonicalUrl) {
    return c.json({ ok: false, error: 'articleTitle and canonicalUrl are required' }, 400);
  }

  const subscriberDids = getActiveSubscriberDids(publicationUri);
  if (subscriberDids.length === 0) {
    return c.json({ ok: true, sent: 0, skipped: 0 });
  }

  const handle = process.env.AUTHOR_HANDLE;
  const appPassword = process.env.AUTHOR_APP_PASSWORD;
  if (!handle || !appPassword) {
    console.error('[notify] AUTHOR_HANDLE or AUTHOR_APP_PASSWORD not set');
    return c.json({ ok: false, error: 'Author credentials not configured' }, 500);
  }

  const agent = new AtpAgent({ service: 'https://bsky.social' });
  try {
    await agent.login({ identifier: handle, password: appPassword });
  } catch (err) {
    console.error('[notify] AtpAgent login failed:', String(err));
    return c.json({ ok: false, error: 'Author login failed' }, 500);
  }

  const unsubscribeUrl = `https://social.scribe-atp.app/unsubscribe?publication=${encodeURIComponent(publicationUri)}&origin=${encodeURIComponent(origin)}&title=${encodeURIComponent(siteTitle)}`;
  const prefix = siteTitle ? `New article from ${siteTitle}: ` : 'New article: ';
  const messageText = `${prefix}"${articleTitle}"\n${canonicalUrl}\n\nTo unsubscribe: ${unsubscribeUrl}`;

  let sent = 0;
  let skipped = 0;

  // Fire and forget — attempt all, log failures, no retry
  await Promise.allSettled(
    subscriberDids.map(async (did) => {
      try {
        const convoId = await getOrCreateConvoId(agent, did);
        await sendDm(agent, convoId, messageText);
        sent++;
        console.log(`[notify] DM sent to ${did}`);
      } catch (err) {
        skipped++;
        console.warn(`[notify] DM failed for ${did}:`, String(err));
      }
    })
  );

  return c.json({ ok: true, sent, skipped });
}
