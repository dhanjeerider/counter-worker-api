# Counter Worker API

A developer-friendly counter REST API and documentation website built on Cloudflare Workers and Cloudflare D1 (SQLite). The Worker serves a public landing page, API documentation, a route reference and JSON API endpoints from the same hostname.

## Website

After deploying the Worker, open:

- `/` — landing page
- `/docs` — getting started, authentication, examples and an interactive API tester
- `/routes` — complete HTTP route directory
- `/api` — API discovery metadata as JSON
- `/api/routes` — all routes as JSON
- `/health` — service health check

## Features

- Cloudflare Workers runtime with a D1 database binding
- Mobile-friendly landing page, docs and API routes reference
- Browser API tester for trying requests against the current Worker
- Atomic increment/decrement operations using SQLite UPSERT + `RETURNING`
- Default counter plus named counters
- Read, set, reset, list and delete operations
- Optional API-key protection for every write operation
- Configurable CORS origin
- JSON responses, input validation and health endpoint
- No ORM or runtime dependencies

## Install

Requires Node.js 20+ and a Cloudflare account.

```bash
npm install
```

## D1 database

This repository is configured for the `counter-worker-api` D1 database. The database ID is already set in `wrangler.toml`. Apply the migration:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

The remote migration creates the `counters` table and its updated-time index.

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

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api` | API metadata and route discovery |
| GET | `/api/routes` | Route catalogue in JSON |
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

## Important behavior

This project is a persistent counter REST API with a Firebase-inspired developer website. It is **not** a full Firebase Realtime Database replacement: it does not expose arbitrary JSON tree paths, WebSocket subscriptions or Server-Sent Events. Reads are request/response HTTP calls. See `/docs` for integration examples and `/routes` for the current API surface.

Counter IDs accept 1–64 letters, numbers, underscores or hyphens. Increment/decrement amounts are bounded integers. Reads are public by default; add read authentication in the Worker if your use case requires it.

## Cloudflare references

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/d1/reference/migrations/
