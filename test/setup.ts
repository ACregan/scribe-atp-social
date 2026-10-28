import { PGlite } from '@electric-sql/pglite';
import { migrate, setDbClient } from '../src/db.js';

// Runs once per test file, before that file's own imports are evaluated —
// several modules (session.ts) read env vars at module load time and throw
// or misbehave if they're missing, so these must be set here rather than in
// individual test files.
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';
process.env.NOTIFY_SECRET ??= 'test-notify-secret';

// A fresh in-process Postgres per test file (tests within a file share it,
// so they clear the tables they use). int8 parsed to numbers, as pg.ts does.
setDbClient(new PGlite({ parsers: { 20: (v: string) => Number(v) } }));
await migrate();
