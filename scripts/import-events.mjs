// One-off: copies the Follow/Like/Share history from the old SQLite
// database into Postgres (ADR 0097 decision 3 in skyscribe-app). Sessions
// aren't copied: they belong to the old OAuth client.
//
// 1. On the VPS:
//      sqlite3 -json ~/server/SITES/scribe-atp-social/ROOT/data/social.db \
//        "SELECT action_type, subject_uri, document_uri, publication_uri, origin, did, created_at FROM action_events" \
//        > action_events.json
// 2. Locally, with the production DATABASE_URL, after the service has started
//    once (it creates the tables):
//      DATABASE_URL=... node scripts/import-events.mjs action_events.json
//
// Refuses to run if action_events already has rows, so it can't double up.

import fs from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... node scripts/import-events.mjs action_events.json');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows: existing } = await client.query('SELECT COUNT(*)::int AS n FROM action_events');
  if (existing[0].n > 0) {
    console.error(`action_events already has ${existing[0].n} rows; not importing.`);
    process.exit(1);
  }
  await client.query('BEGIN');
  for (const r of rows) {
    await client.query(
      `INSERT INTO action_events
         (action_type, subject_uri, document_uri, publication_uri, origin, did, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [r.action_type, r.subject_uri, r.document_uri, r.publication_uri, r.origin, r.did, r.created_at],
    );
  }
  await client.query('COMMIT');
  const counts = {};
  for (const r of rows) counts[r.action_type] = (counts[r.action_type] ?? 0) + 1;
  console.log(`Imported ${rows.length} events:`, counts);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  await client.end();
}
