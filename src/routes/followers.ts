import type { Context } from 'hono';
import { checkedFollowers } from '../followers.js';
import { verifyBearerSecret } from '../session.js';

const DAY = 24 * 60 * 60;

// skyscribe-app reads a Publication's Followers here (ADR 0097): their
// count for Insights, and their DIDs to send a Follower Notification.
// max_age is how old a "still following" check may be, in seconds: the
// default suits counts; a notification asks for 0 (check everyone now).
export async function handleFollowers(c: Context) {
  const authHeader = c.req.header('Authorization') ?? '';
  if (!verifyBearerSecret(authHeader, process.env.APP_API_SECRET)) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const publicationUri = c.req.query('publication_uri') ?? '';
  if (!publicationUri.startsWith('at://')) {
    return c.json({ ok: false, error: 'publication_uri must be an AT URI' }, 400);
  }
  const maxAgeParam = c.req.query('max_age');
  const maxAge = maxAgeParam === undefined ? DAY : Number(maxAgeParam);
  if (!Number.isInteger(maxAge) || maxAge < 0) {
    return c.json({ ok: false, error: 'max_age must be a whole number of seconds' }, 400);
  }

  const followers = await checkedFollowers(publicationUri, maxAge);
  return c.json({ count: followers.length, followers });
}
