export const ALLOWED_ORIGINS = [
  'https://norobots.blog',
  'https://anthonycregan.co.uk',
  'https://www.anthonycregan.co.uk',
  'https://perpetualsummer.ltd',
  'https://www.perpetualsummer.ltd',
] as const;

export type AllowedOrigin = (typeof ALLOWED_ORIGINS)[number];

export const OAUTH_SCOPE = [
  'atproto',
  'repo:site.standard.graph.recommend?action=create',
  'repo:site.standard.graph.subscription?action=create',
  'repo:app.bsky.feed.post?action=create',
  'blob:image/*',
].join(' ');

export const SESSION_COOKIE = 'scribe_session';
export const PENDING_COOKIE = 'scribe_pending';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const PENDING_MAX_AGE = 60 * 10; // 10 minutes
export const RATE_LIMIT_WINDOW = 900; // 15 minutes
export const RATE_LIMIT_MAX = 5;
