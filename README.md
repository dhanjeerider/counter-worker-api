# Counter Worker API

A small REST API built on Cloudflare Workers and Cloudflare D1 (SQLite). It has no web framework, uses prepared SQL statements, and updates counters atomically in the database.

## Features
- Cloudflare Workers runtime with a D1 database binding
- Atomic increment/decrement operations using SQLite UPSERT + `RETURNING`
- Default counter plus unlimited named counters
- Read, set, reset, list and delete operations
- Optional API-key protection for every write operation
- Configurable CORS origin
- JSON responses, input validation and a health endpoint
- No ORM or runtime dependencies

## Install
Requires Node.js 20+ and a Cloudflare account.
```bash
npm install
```

## Create D1 database
```bash
npm run db:create
```
Copy the generated database ID into `wrangler.toml` under `database_id` (do not leave the placeholder).

## Apply migrations
```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## Configure secrets
For a public deployment, protect write endpoints with a strong secret:
```bash
npx wrangler secret put API_KEY
```
Set `ALLOWED_ORIGIN` as a Worker variable if browser access should be restricted. For local development, copy `.dev.vars.example` to `.dev.vars`. Never expose a production API key in frontend JavaScript.

## Run and deploy
```bash
npm run dev
npm run deploy
```

## Endpoints
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/counter` | Read default counter |
| POST | `/api/counter/increment` | Increment default counter |
| POST | `/api/counter/decrement` | Decrement default counter |
| POST | `/api/counter/reset` | Reset default counter |
| POST | `/api/counter/set` | Set default counter |
| GET | `/api/counters` | List counters |
| GET | `/api/counters/:id` | Read named counter |
| PUT | `/api/counters/:id` | Set named counter |
| DELETE | `/api/counters/:id` | Delete named counter |
| POST | `/api/counters/:id/increment` | Increment named counter |
| POST | `/api/counters/:id/decrement` | Decrement named counter |
| POST | `/api/counters/:id/reset` | Reset named counter |

A counter is created automatically when first changed. Reading a missing counter returns zero and `exists: false` without inserting a row.

See `examples/client.js` for a small fetch-based client. Counter IDs accept 1–64 letters, numbers, `_` or `-`. Increment/decrement amounts are bounded integers. Reads are public by default; add read authentication in the Worker if needed.

## Cloudflare docs
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/d1/reference/migrations/
