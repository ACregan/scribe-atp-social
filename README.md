# skyscribe-social

Hono service behind the reader-side **Like**, **Follow** and **Share** buttons
on SDK-driven websites and SkyScribe Sites. Readers sign in with Bluesky
OAuth in a popup; Likes and Follows are written to the reader's own account
as `site.standard.graph.recommend` and `site.standard.graph.subscription`
records. Runs at `social.skyscribe.app` on Fly, with its data in Neon
Postgres. Decisions: skyscribe-app's ADR 0097. It was `scribe-atp-social` at
`social.scribe-atp.app`, which now redirects here.

Words: a reader **Follows** a Publication and is one of its **Followers**
(skyscribe-app's CONTEXT.md). The record type, the internal action names
(`subscribe`/`unsubscribe`) and the SDK's `SubscribeButton` still say
"subscription"; "Subscription" in SkyScribe means the paid PRO plan.

## Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/recommend` | — | Like popup |
| `POST` | `/recommend` | session cookie | Create a recommend record on the reader's PDS |
| `GET` | `/follow` | — | Follow popup (`/subscribe` is an alias) |
| `POST` | `/follow` | session cookie | Create a Follow record on the reader's PDS |
| `GET` | `/unfollow` | — | Unfollow popup, or the link in a Follower Notification DM (`/unsubscribe` is an alias) |
| `POST` | `/unfollow` | session cookie | Delete the reader's Follow record |
| `GET` | `/share` | — | Share popup |
| `POST` | `/share` | session cookie | Post a link to the reader's Bluesky account |
| `POST` | `/initiate` | — | Start OAuth sign-in (rate limited: 5/15 min/IP) |
| `GET` | `/callback` | — | OAuth callback |
| `GET` | `/status/:token` | — | Poll for an action's completion (COOP fallback) |
| `GET` | `/followers` | Bearer `APP_API_SECRET` | A Publication's checked Followers, for skyscribe-app |
| `GET` | `/events` | Bearer `APP_API_SECRET` | Raw action event log |
| `GET` | `/counts` | — (any origin) | Aggregate counts, rate limited |
| `GET` | `/health` | — | Health check |

## The website check

A popup only works on its own Publication's website (ADR 0097 decision 5):
the `origin` it reports must be the Publication's `url` host (`www.` and the
bare domain alike), or a hostname skyscribe-app's site-resolve endpoint maps
to a SkyScribe Site showing that Publication. There's nothing to register.
An unfollow link opened from a DM has no origin and isn't checked.

## `GET /followers`

Follower Notifications (the DMs about a new post) are sent by skyscribe-app
from the author's own account, not by this service.

A Publication's Followers: readers whose latest Follow-or-unfollow here was
a Follow and whose Follow record is still in their account (ADR 0097
decision 6). A missing record is logged as an unfollow.

| Param | Required | Description |
|-------|----------|-------------|
| `publication_uri` | yes | The Publication's AT URI |
| `max_age` | no | Seconds a "still following" check stays valid (default 86400). `0` checks everyone now, before a Follower Notification |

```json
{ "count": 2, "followers": ["did:plc:…", "did:plc:…"] }
```

---

## `GET /events`

Returns raw action event records. Protected — requires `Authorization: Bearer <NOTIFY_SECRET>`.

### Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `action_type` | yes | `recommend`, `subscribe`, or `share` |
| `publication_uri` | no | Filter by publication AT URI |
| `document_uri` | no | Filter by document AT URI |
| `did` | no | Filter by reader DID |
| `from` | no | Start of window — ISO 8601 or relative (`-7d`, `-14d`, `-30d`) |
| `to` | no | End of window — ISO 8601 or relative; defaults to now |
| `limit` | no | 1–100, default 50 |
| `offset` | no | Default 0 |

### Response

```json
{
  "events": [
    {
      "action_type": "recommend",
      "did": "did:plc:...",
      "document_uri": "at://did:plc:.../site.standard.document/3mp...",
      "publication_uri": "at://did:plc:.../site.standard.publication/3mp...",
      "origin": "https://norobots.blog",
      "created_at": 1782995765
    }
  ],
  "total": 42
}
```

### Example queries

```
# What articles has a specific user liked from a site?
GET /events?action_type=recommend&did=did:plc:USER&publication_uri=at://did:plc:AUTHOR/site.standard.publication/RK

# Who has shared articles and what did they share?
GET /events?action_type=share
```

---

## `GET /counts`

Returns aggregate event counts. Open to any origin (CORS `*`): they're public totals. IP rate limited at 60 requests/minute. Date range capped at 90 days.

### Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `action_type` | yes | `recommend`, `subscribe`, or `share` |
| `publication_uri` | no | Filter by publication AT URI |
| `document_uri` | no | Filter by document AT URI |
| `origin` | no | Filter to events from a specific origin, e.g. `https://norobots.blog` |
| `from` | no | Start of window — ISO 8601 or relative (`-7d`, `-14d`, `-30d`) |
| `to` | no | End of window — ISO 8601 or relative; defaults to now |
| `group_by` | no | `document_uri`, `did`, or `day` |
| `order_by` | no | `count` (default) or `date`; only applies with `group_by` |
| `limit` | no | 1–100, default 10; only applies with `group_by` |

### Response without `group_by`

```json
{ "count": 42 }
```

### Response with `group_by`

```json
{
  "groups": [
    { "key": "at://did:plc:.../site.standard.document/3mp...", "count": 17 },
    { "key": "at://did:plc:.../site.standard.document/3mq...", "count":  9 }
  ],
  "total": 42
}
```

When `group_by=day`, the key is an ISO date string (`2026-07-02`).

### Example queries

```
# Subscribes for a site over the past 7 days
GET /counts?action_type=subscribe&publication_uri=at://...&from=-7d

# Subscribes the week before that (for week-on-week comparison)
GET /counts?action_type=subscribe&publication_uri=at://...&from=-14d&to=-7d

# Most shared articles in the past 30 days
GET /counts?action_type=share&from=-30d&group_by=document_uri&order_by=count&limit=10
```

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (Neon) |
| `SESSION_SECRET` | 32+ random characters; signs the session and pending cookies |
| `PUBLIC_URL` | This service's base URL (`https://social.skyscribe.app`, set in `fly.toml`) |
| `APP_API_SECRET` | Bearer secret skyscribe-app sends to `/followers` and `/events` (its `SOCIAL_API_SECRET`) |
| `SKYSCRIBE_APP_URL` | skyscribe-app's base URL, for the website check (set in `fly.toml`) |
| `SOCIAL_RESOLVE_SECRET` | The same value as skyscribe-app's `SOCIAL_RESOLVE_SECRET` |
| `PORT` | Server port (8080 on Fly, default 3011) |

## Development

`npm run dev` needs a Postgres `DATABASE_URL`. Tests need nothing: each test
file runs against its own in-process PGlite (`test/setup.ts`).

## Deploying

The manual `deploy` job on `main` runs `flyctl deploy --remote-only` with the
`FLY_API_TOKEN` CI variable. The schema is created on startup.

## Moving from the VPS (once)

1. Create the Neon database `skyscribe_social` and the Fly app
   `skyscribe-social` (`fly apps create skyscribe-social`).
2. `fly secrets set DATABASE_URL=… SESSION_SECRET=… APP_API_SECRET=…
   SOCIAL_RESOLVE_SECRET=…`, set
   `SOCIAL_RESOLVE_SECRET` on skyscribe-app too, add `FLY_API_TOKEN` to this
   repo's CI variables, and run the `deploy` job.
3. `fly certs add social.skyscribe.app`, and the DNS record it asks for in the
   `skyscribe.app` Cloudflare zone. Check `/health` and `/client-metadata.json`.
4. Copy the history: on the VPS, export with the `sqlite3 -json` command in
   `scripts/import-events.mjs`, then run that script with the Neon
   `DATABASE_URL`.
5. Point `social.scribe-atp.app` at the new service: an nginx `return 308
   https://social.skyscribe.app$request_uri;`. Then stop the PM2 job. Old SDK
   versions, sites that haven't updated and old DM links keep working
   through the redirect; check each button on the three SDK sites.
