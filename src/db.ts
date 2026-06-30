import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX } from './config.js';

const DB_PATH = path.resolve(process.cwd(), 'data/social.db');

let _db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_state (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS oauth_session (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT    PRIMARY KEY,
      did          TEXT    NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS sessions_did ON sessions (did);

    CREATE TABLE IF NOT EXISTS initiate_attempts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ip         TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS initiate_attempts_ip_created
      ON initiate_attempts (ip, created_at);

    CREATE TABLE IF NOT EXISTS completion_tokens (
      token      TEXT    PRIMARY KEY,
      action     TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS action_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type      TEXT    NOT NULL,
      subject_uri      TEXT    NOT NULL,
      document_uri     TEXT,
      publication_uri  TEXT,
      origin           TEXT,
      did              TEXT    NOT NULL,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS action_events_subject
      ON action_events (action_type, subject_uri);
  `);

  // Add columns to existing databases that pre-date this schema — must run
  // before the indexes on those columns are created below.
  for (const col of ['document_uri TEXT', 'publication_uri TEXT', 'origin TEXT']) {
    try { db.exec(`ALTER TABLE action_events ADD COLUMN ${col}`); } catch { /* already exists */ }
  }

  // Indexes on the columns added above — kept separate so they run after ALTER TABLE.
  for (const stmt of [
    'CREATE INDEX IF NOT EXISTS action_events_publication ON action_events (publication_uri)',
    'CREATE INDEX IF NOT EXISTS action_events_document ON action_events (document_uri)',
  ]) {
    try { db.exec(stmt); } catch { /* already exists */ }
  }

  // Backfill existing rows from subject_uri
  db.exec(`
    UPDATE action_events SET document_uri = subject_uri
      WHERE action_type IN ('recommend', 'share') AND document_uri IS NULL;
    UPDATE action_events SET publication_uri = subject_uri
      WHERE action_type = 'subscribe' AND publication_uri IS NULL;
  `);
}

function pruneStaleState(db: Database.Database) {
  db.prepare('DELETE FROM oauth_state WHERE created_at < unixepoch() - 600').run();
}

function pruneStaleInitiateAttempts(db: Database.Database) {
  db.prepare(
    'DELETE FROM initiate_attempts WHERE created_at < unixepoch() - ?'
  ).run(RATE_LIMIT_WINDOW);
}

export const db = getDb();

pruneStaleState(db);
pruneStaleInitiateAttempts(db);
pruneStaleCompletionTokens(db);

export const oauthStateStore = {
  get: (key: string) => {
    const row = db
      .prepare<string, { value: string }>('SELECT value FROM oauth_state WHERE key = ?')
      .get(key);
    return Promise.resolve(row ? JSON.parse(row.value) : undefined);
  },
  set: (key: string, val: unknown) => {
    db.prepare(
      'INSERT OR REPLACE INTO oauth_state (key, value, created_at) VALUES (?, ?, unixepoch())'
    ).run(key, JSON.stringify(val));
    return Promise.resolve();
  },
  del: (key: string) => {
    db.prepare('DELETE FROM oauth_state WHERE key = ?').run(key);
    return Promise.resolve();
  },
};

export const oauthSessionStore = {
  get: (key: string) => {
    const row = db
      .prepare<string, { value: string }>('SELECT value FROM oauth_session WHERE key = ?')
      .get(key);
    return Promise.resolve(row ? JSON.parse(row.value) : undefined);
  },
  set: (key: string, val: unknown) => {
    db.prepare(
      'INSERT OR REPLACE INTO oauth_session (key, value, updated_at) VALUES (?, ?, unixepoch())'
    ).run(key, JSON.stringify(val));
    return Promise.resolve();
  },
  del: (key: string) => {
    db.prepare('DELETE FROM oauth_session WHERE key = ?').run(key);
    return Promise.resolve();
  },
};

export const sessionStore = {
  create: (did: string): string => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO sessions (id, did) VALUES (?, ?)').run(id, did);
    return id;
  },
  get: (id: string): string | undefined => {
    const row = db
      .prepare<string, { did: string }>('SELECT did FROM sessions WHERE id = ?')
      .get(id);
    return row?.did;
  },
  touch: (id: string) => {
    db.prepare('UPDATE sessions SET last_used_at = unixepoch() WHERE id = ?').run(id);
  },
  delete: (id: string) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },
};

function pruneStaleCompletionTokens(db: Database.Database) {
  db.prepare('DELETE FROM completion_tokens WHERE created_at < unixepoch() - 3600').run();
}

export const completionTokens = {
  store: (token: string, action: string) => {
    db.prepare(
      'INSERT OR IGNORE INTO completion_tokens (token, action) VALUES (?, ?)'
    ).run(token, action);
  },
  lookup: (token: string): string | undefined => {
    const row = db
      .prepare<string, { action: string }>('SELECT action FROM completion_tokens WHERE token = ?')
      .get(token);
    return row?.action;
  },
};

export const actionEvents = {
  log: (opts: {
    actionType: string;
    documentUri?: string | null;
    publicationUri?: string | null;
    origin: string;
    did: string;
  }) => {
    const subjectUri = opts.documentUri ?? opts.publicationUri ?? '';
    db.prepare(
      `INSERT INTO action_events
         (action_type, subject_uri, document_uri, publication_uri, origin, did)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(opts.actionType, subjectUri, opts.documentUri ?? null, opts.publicationUri ?? null, opts.origin, opts.did);
  },
};

export const initiateAttempts = {
  record: (ip: string) => {
    db.prepare('INSERT INTO initiate_attempts (ip) VALUES (?)').run(ip);
  },
  count: (ip: string): number => {
    const row = db
      .prepare<[string, number], { n: number }>(
        'SELECT COUNT(*) as n FROM initiate_attempts WHERE ip = ? AND created_at > unixepoch() - ?'
      )
      .get(ip, RATE_LIMIT_WINDOW);
    return row?.n ?? 0;
  },
  isLimited: (ip: string): boolean => initiateAttempts.count(ip) >= RATE_LIMIT_MAX,
};
