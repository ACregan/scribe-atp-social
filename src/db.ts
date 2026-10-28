import pg from 'pg';
import { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX } from './config.js';

// Postgres (Neon in production, ADR 0097 in skyscribe-app). Timestamps stay
// epoch seconds in BIGINT columns, as they were in SQLite, and int8 values
// are parsed to numbers so callers do arithmetic on them as before.

export interface DbClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// int8: COUNT(*) and the BIGINT epoch columns. Safe as a number: counts and
// epoch seconds are far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

let client: DbClient | undefined;

// Tests swap in an in-process PGlite (test/setup.ts).
export function setDbClient(c: DbClient) {
  client = c;
}

function getClient(): DbClient {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    client = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return client;
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await getClient().query<T>(sql, params)).rows;
}

// floor(), not a plain ::bigint cast, which rounds: x.6 seconds would be
// stamped a second in the future and miss `created_at <= now` filters.
// SQLite's unixepoch() truncated.
const NOW = '(floor(extract(epoch from now()))::bigint)';

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS oauth_state (
      key        TEXT   PRIMARY KEY,
      value      TEXT   NOT NULL,
      created_at BIGINT NOT NULL DEFAULT ${NOW}
    );

    CREATE TABLE IF NOT EXISTS oauth_session (
      key        TEXT   PRIMARY KEY,
      value      TEXT   NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT ${NOW}
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT   PRIMARY KEY,
      did          TEXT   NOT NULL,
      created_at   BIGINT NOT NULL DEFAULT ${NOW},
      last_used_at BIGINT NOT NULL DEFAULT ${NOW}
    );
    CREATE INDEX IF NOT EXISTS sessions_did ON sessions (did);

    CREATE TABLE IF NOT EXISTS initiate_attempts (
      id         BIGSERIAL PRIMARY KEY,
      ip         TEXT      NOT NULL,
      created_at BIGINT    NOT NULL DEFAULT ${NOW}
    );
    CREATE INDEX IF NOT EXISTS initiate_attempts_ip_created
      ON initiate_attempts (ip, created_at);

    CREATE TABLE IF NOT EXISTS completion_tokens (
      token      TEXT   PRIMARY KEY,
      action     TEXT   NOT NULL,
      created_at BIGINT NOT NULL DEFAULT ${NOW}
    );

    CREATE TABLE IF NOT EXISTS action_events (
      id              BIGSERIAL PRIMARY KEY,
      action_type     TEXT      NOT NULL,
      subject_uri     TEXT      NOT NULL,
      document_uri    TEXT,
      publication_uri TEXT,
      origin          TEXT,
      did             TEXT      NOT NULL,
      created_at      BIGINT    NOT NULL DEFAULT ${NOW}
    );
    CREATE INDEX IF NOT EXISTS action_events_subject
      ON action_events (action_type, subject_uri);
    CREATE INDEX IF NOT EXISTS action_events_publication ON action_events (publication_uri);
    CREATE INDEX IF NOT EXISTS action_events_document ON action_events (document_uri);
    CREATE INDEX IF NOT EXISTS action_events_pub_type_time
      ON action_events (publication_uri, action_type, created_at);
    CREATE INDEX IF NOT EXISTS action_events_type_time
      ON action_events (action_type, created_at);
`;

// One statement at a time: PGlite (the tests) refuses several in one query.
export async function migrate() {
  for (const statement of SCHEMA.split(';')) {
    if (statement.trim()) await query(statement);
  }
}

// GDPR retention policy — 90-day limit on inactive personal data.
const NINETY_DAYS = 90 * 24 * 60 * 60;

// Run at startup and hourly (index.ts): a Fly machine can run for weeks
// between deploys, unlike the old PM2 process restarted by every deploy.
export async function prune() {
  await query(`DELETE FROM oauth_state WHERE created_at < ${NOW} - 600`);
  await query(`DELETE FROM initiate_attempts WHERE created_at < ${NOW} - $1`, [
    RATE_LIMIT_WINDOW,
  ]);
  await query(`DELETE FROM completion_tokens WHERE created_at < ${NOW} - 3600`);
  // Unsubscribe events are logged for auditing then become stale — the PDS
  // record is already deleted, so there is no active subscription to track.
  await query(
    `DELETE FROM action_events WHERE action_type = 'unsubscribe' AND created_at < ${NOW} - $1`,
    [NINETY_DAYS],
  );
  // Recommend and share events — one-off actions containing reader DIDs.
  // Retained for 90 days for analytics (within the /counts query cap), then
  // pruned. Subscribe events are deliberately excluded: active subscriptions
  // must be kept for the /notify fan-out query.
  await query(
    `DELETE FROM action_events WHERE action_type IN ('recommend', 'share') AND created_at < ${NOW} - $1`,
    [NINETY_DAYS],
  );
  // OAuth sessions inactive for 90+ days — updated_at reflects last token refresh.
  await query(`DELETE FROM oauth_session WHERE updated_at < ${NOW} - $1`, [NINETY_DAYS]);
  // User sessions (scribe_session cookie) inactive for 90+ days.
  await query(`DELETE FROM sessions WHERE last_used_at < ${NOW} - $1`, [NINETY_DAYS]);
}

function kvStore(table: 'oauth_state' | 'oauth_session', timeCol: 'created_at' | 'updated_at') {
  return {
    get: async (key: string) => {
      const [row] = await query<{ value: string }>(
        `SELECT value FROM ${table} WHERE key = $1`,
        [key],
      );
      return row ? JSON.parse(row.value) : undefined;
    },
    set: async (key: string, val: unknown) => {
      await query(
        `INSERT INTO ${table} (key, value, ${timeCol}) VALUES ($1, $2, ${NOW})
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, ${timeCol} = excluded.${timeCol}`,
        [key, JSON.stringify(val)],
      );
    },
    del: async (key: string) => {
      await query(`DELETE FROM ${table} WHERE key = $1`, [key]);
    },
  };
}

export const oauthStateStore = kvStore('oauth_state', 'created_at');
export const oauthSessionStore = kvStore('oauth_session', 'updated_at');

export const sessionStore = {
  create: async (did: string): Promise<string> => {
    const id = crypto.randomUUID();
    await query('INSERT INTO sessions (id, did) VALUES ($1, $2)', [id, did]);
    return id;
  },
  get: async (id: string): Promise<string | undefined> => {
    const [row] = await query<{ did: string }>('SELECT did FROM sessions WHERE id = $1', [id]);
    return row?.did;
  },
  touch: async (id: string) => {
    await query(`UPDATE sessions SET last_used_at = ${NOW} WHERE id = $1`, [id]);
  },
  delete: async (id: string) => {
    await query('DELETE FROM sessions WHERE id = $1', [id]);
  },
};

export const completionTokens = {
  store: async (token: string, action: string) => {
    await query(
      'INSERT INTO completion_tokens (token, action) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING',
      [token, action],
    );
  },
  lookup: async (token: string): Promise<string | undefined> => {
    const [row] = await query<{ action: string }>(
      'SELECT action FROM completion_tokens WHERE token = $1',
      [token],
    );
    return row?.action;
  },
};

export const actionEvents = {
  log: async (opts: {
    actionType: string;
    documentUri?: string | null;
    publicationUri?: string | null;
    origin: string;
    did: string;
  }) => {
    const subjectUri = opts.documentUri ?? opts.publicationUri ?? '';
    await query(
      `INSERT INTO action_events
         (action_type, subject_uri, document_uri, publication_uri, origin, did)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        opts.actionType,
        subjectUri,
        opts.documentUri ?? null,
        opts.publicationUri ?? null,
        opts.origin,
        opts.did,
      ],
    );
  },
};

export const follows = {
  // A reader follows a Publication when their latest subscribe-or-unsubscribe
  // event for it is a subscribe. Ties (same second) go to the later row.
  activeDids: async (publicationUri: string): Promise<string[]> => {
    const rows = await query<{ did: string }>(
      `SELECT did FROM (
         SELECT DISTINCT ON (did) did, action_type
         FROM action_events
         WHERE publication_uri = $1
           AND action_type IN ('subscribe', 'unsubscribe')
         ORDER BY did, created_at DESC, id DESC
       ) latest
       WHERE action_type = 'subscribe'`,
      [publicationUri],
    );
    return rows.map((r) => r.did);
  },
};

export const initiateAttempts = {
  record: async (ip: string) => {
    await query('INSERT INTO initiate_attempts (ip) VALUES ($1)', [ip]);
  },
  count: async (ip: string): Promise<number> => {
    const [row] = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM initiate_attempts WHERE ip = $1 AND created_at > ${NOW} - $2`,
      [ip, RATE_LIMIT_WINDOW],
    );
    return row?.n ?? 0;
  },
  isLimited: async (ip: string): Promise<boolean> =>
    (await initiateAttempts.count(ip)) >= RATE_LIMIT_MAX,
};
