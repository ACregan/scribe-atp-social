import { follows, query } from './db.js';
import { resolvePds } from './utils/atRecord.js';
import { followedPublication } from './utils/graphRecords.js';

// A Publication's Followers (ADR 0097 decision 6 in skyscribe-app): readers
// whose latest Follow-or-unfollow through Social was a Follow, and whose
// Follow record is still in their account. Someone who unfollowed in another
// app is never messaged.

const CONCURRENCY = 8;

type Check = 'following' | 'not-following' | 'unknown';

// Lists the reader's Follow records straight from their PDS (public data, no
// sign-in). A network failure is 'unknown', not 'not-following'.
export async function checkFollow(did: string, publicationUri: string): Promise<Check> {
  try {
    const pds = await resolvePds(did);
    if (!pds) return 'unknown';
    let cursor: string | undefined;
    do {
      const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
      url.searchParams.set('repo', did);
      url.searchParams.set('collection', 'site.standard.graph.subscription');
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url);
      if (!res.ok) return 'unknown';
      const data = (await res.json()) as {
        records?: Array<{ value: unknown }>;
        cursor?: string;
      };
      if (data.records?.some((r) => followedPublication(r.value) === publicationUri)) {
        return 'following';
      }
      cursor = data.records?.length ? data.cursor : undefined;
    } while (cursor);
    return 'not-following';
  } catch {
    return 'unknown';
  }
}

async function lastChecked(publicationUri: string): Promise<Map<string, number>> {
  const rows = await query<{ did: string; checked_at: number }>(
    'SELECT did, checked_at FROM follow_checks WHERE publication_uri = $1',
    [publicationUri],
  );
  return new Map(rows.map((r) => [r.did, r.checked_at]));
}

// maxAgeSeconds: how old a 'following' check may be before it's checked
// again. 0 checks everyone now (before a Follower Notification).
export async function checkedFollowers(
  publicationUri: string,
  maxAgeSeconds: number,
): Promise<string[]> {
  const candidates = await follows.activeDids(publicationUri);
  const checked = await lastChecked(publicationUri);
  const now = Math.floor(Date.now() / 1000);

  const followers: string[] = [];
  const toCheck = candidates.filter((did) => {
    const at = checked.get(did);
    if (maxAgeSeconds > 0 && at !== undefined && now - at <= maxAgeSeconds) {
      followers.push(did);
      return false;
    }
    return true;
  });

  for (let i = 0; i < toCheck.length; i += CONCURRENCY) {
    await Promise.all(
      toCheck.slice(i, i + CONCURRENCY).map(async (did) => {
        const result = await checkFollow(did, publicationUri);
        if (result === 'not-following') {
          // Unfollowed elsewhere: recorded as an unfollow, so they drop out
          // until they Follow through Social again.
          await query(
            `INSERT INTO action_events (action_type, subject_uri, publication_uri, origin, did)
             VALUES ('unsubscribe', $1, $1, NULL, $2)`,
            [publicationUri, did],
          );
          await query('DELETE FROM follow_checks WHERE publication_uri = $1 AND did = $2', [
            publicationUri,
            did,
          ]);
          return;
        }
        followers.push(did);
        if (result === 'following') {
          await query(
            `INSERT INTO follow_checks (publication_uri, did, checked_at) VALUES ($1, $2, $3)
               ON CONFLICT (publication_uri, did) DO UPDATE SET checked_at = excluded.checked_at`,
            [publicationUri, did, now],
          );
        }
      }),
    );
  }
  return followers.sort();
}
