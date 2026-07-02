# scribe-atp-social

Hono micro-service powering social interactions (like, subscribe, share) on Scribe consumer sites via AT Protocol OAuth. Runs at `social.scribe-atp.app`.

## Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/recommend` | — | Like button popup |
| `POST` | `/recommend` | session cookie | Create recommend record on reader's PDS |
| `GET` | `/subscribe` | — | Subscribe button popup |
| `POST` | `/subscribe` | session cookie | Create subscription record on reader's PDS |
| `GET` | `/unsubscribe` | — | Unsubscribe confirmation popup |
| `POST` | `/unsubscribe` | session cookie | Delete subscription record on reader's PDS |
| `GET` | `/share` | — | Share button popup |
| `POST` | `/share` | session cookie | Cross-post article to Bluesky |
| `POST` | `/initiate` | — | Start OAuth flow (rate limited: 5/15 min/IP) |
| `GET` | `/callback` | — | OAuth callback |
| `GET` | `/status/:token` | — | Poll for action completion (COOP fallback) |
| `POST` | `/notify` | Bearer secret | Send Bluesky DMs to subscribers on new article |
| `GET` | `/events` | Bearer secret | Query raw action event log (CMS only) |
| `GET` | `/counts` | CORS allowlist | Query aggregate counts (consumer sites + CMS) |
| `GET` | `/health` | — | Health check |

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

Returns aggregate counts. Public within the CORS allowlist (`norobots.blog`, `anthonycregan.co.uk`, `perpetualsummer.ltd`, `scribe-cms.app`). IP rate limited at 60 requests/minute. Date range capped at 90 days.

### Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `action_type` | yes | `recommend`, `subscribe`, or `share` |
| `publication_uri` | no | Filter by publication AT URI |
| `document_uri` | no | Filter by document AT URI |
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
| `NOTIFY_SECRET` | Shared secret for `/notify` and `/events` |
| `AUTHOR_HANDLE` | Bluesky handle for sending DM notifications |
| `AUTHOR_APP_PASSWORD` | App password with DM permissions enabled |
| `PORT` | Server port (default 3000) |
