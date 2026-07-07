// Runs once per test file, before that file's own imports are evaluated —
// several modules (session.ts, db.ts) read env vars at module load time and
// throw or misbehave if they're missing, so these must be set here rather
// than in individual test files.
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';
process.env.NOTIFY_SECRET ??= 'test-notify-secret';
process.env.SOCIAL_DB_PATH ??= ':memory:';
