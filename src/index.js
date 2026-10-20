const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const MAX_BODY_LENGTH = 1024;
const MAX_DELTA = 1_000_000_000;
const DEFAULT_COUNTER_ID = "default";
const COUNTER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function makeHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";
  const headers = new Headers(JSON_HEADERS);
  headers.set("access-control-allow-origin", allowedOrigin === "*" ? "*" : allowedOrigin);
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type, X-API-Key");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  if (origin && allowedOrigin !== "*" && origin === allowedOrigin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
function success(data, status, headers) {
  return json({ success: true, data }, status, headers);
}
function failure(code, message, status, headers) {
  return json({ success: false, error: { code, message } }, status, headers);
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_LENGTH) return { error: "Request body is too large." };
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) return { error: "Request body is too large." };
  if (!text.trim()) return { data: {} };
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "JSON body must be an object." };
    return { data };
  } catch {
    return { error: "Invalid JSON body." };
  }
}

function validCounterId(id) { return COUNTER_ID_PATTERN.test(id); }
function getPositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DELTA) return null;
  return value;
}
function getSafeInteger(value) { return Number.isSafeInteger(value) ? value : null; }
function requireApiKey(request, env) {
  if (!env.API_KEY) return true;
  return request.headers.get("x-api-key") === env.API_KEY;
}

async function getCounter(db, id) {
  const row = await db.prepare("SELECT id, value, updated_at FROM counters WHERE id = ?").bind(id).first();
  return row || { id, value: 0, updated_at: null, exists: false };
}
async function listCounters(db, limit) {
  const result = await db.prepare("SELECT id, value, updated_at FROM counters ORDER BY updated_at DESC LIMIT ?").bind(limit).all();
  return result.results || [];
}
async function changeCounter(db, id, delta) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO counters (id, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      value = counters.value + excluded.value,
      updated_at = excluded.updated_at
    RETURNING id, value, updated_at
  `).bind(id, delta, now).first();
}
async function setCounter(db, id, value) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO counters (id, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
    RETURNING id, value, updated_at
  `).bind(id, value, now).first();
}
async function deleteCounter(db, id) {
  const result = await db.prepare("DELETE FROM counters WHERE id = ?").bind(id).run();
  return Boolean(result.meta && result.meta.changes > 0);
}

export default {
  async fetch(request, env) {
    const headers = makeHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!env.DB) return failure("DATABASE_NOT_CONFIGURED", "The D1 database binding is missing.", 503, headers);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (path === "/health" && method === "GET") {
      return success({ status: "ok", service: "counter-worker-api" }, 200, headers);
    }
    if (path === "/api/counter" && method === "GET") {
      try {
        const row = await getCounter(env.DB, DEFAULT_COUNTER_ID);
        return success({ ...row, exists: row.exists ?? true }, 200, headers);
      } catch {
        return failure("DATABASE_ERROR", "Unable to read the counter.", 500, headers);
      }
    }
    if (path === "/api/counters" && method === "GET") {
      const requestedLimit = Number(url.searchParams.get("limit") || 50);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
      try {
        const rows = await listCounters(env.DB, limit);
        return success({ counters: rows, count: rows.length, limit }, 200, headers);
      } catch {
        return failure("DATABASE_ERROR", "Unable to list counters.", 500, headers);
      }
    }

    const defaultActionMatch = path.match(/^\/api\/counter\/(increment|decrement|reset|set)$/);
    const namedMatch = path.match(/^\/api\/counters\/([^/]+)(?:\/(increment|decrement|reset))?$/);
    if (!defaultActionMatch && !namedMatch) return failure("NOT_FOUND", "API endpoint not found.", 404, headers);

    const id = namedMatch ? decodeURIComponent(namedMatch[1]) : DEFAULT_COUNTER_ID;
    const action = defaultActionMatch ? defaultActionMatch[1] : namedMatch[2] || "item";
    if (!validCounterId(id)) {
      return failure("INVALID_COUNTER_ID", "Counter IDs may contain 1–64 letters, numbers, underscores or hyphens.", 400, headers);
    }

    if (namedMatch && action === "item" && method === "GET") {
      try {
        const row = await getCounter(env.DB, id);
        return success({ ...row, exists: row.exists ?? true }, 200, headers);
      } catch {
        return failure("DATABASE_ERROR", "Unable to read the counter.", 500, headers);
      }
    }
    if (namedMatch && action === "item" && method === "DELETE") {
      if (!requireApiKey(request, env)) return failure("UNAUTHORIZED", "A valid x-api-key header is required.", 401, headers);
      try {
        const deleted = await deleteCounter(env.DB, id);
        return success({ id, deleted }, 200, headers);
      } catch {
        return failure("DATABASE_ERROR", "Unable to delete the counter.", 500, headers);
      }
    }

    const isMutation = method === "POST" || (namedMatch && action === "item" && method === "PUT");
    if (!isMutation) {
      headers.set("allow", namedMatch && action === "item" ? "GET, PUT, DELETE, OPTIONS" : "POST, OPTIONS");
      return failure("METHOD_NOT_ALLOWED", "Method not allowed for this endpoint.", 405, headers);
    }
    if (!requireApiKey(request, env)) return failure("UNAUTHORIZED", "A valid x-api-key header is required.", 401, headers);

    const parsed = await readJson(request);
    if (parsed.error) return failure("INVALID_BODY", parsed.error, 400, headers);
    try {
      if (method === "PUT" || action === "set") {
        const value = getSafeInteger(parsed.data.value);
        if (value === null) return failure("INVALID_VALUE", "value must be a safe integer.", 400, headers);
        const row = await setCounter(env.DB, id, value);
        return success(row, 200, headers);
      }
      if (action === "reset") {
        const row = await setCounter(env.DB, id, 0);
        return success(row, 200, headers);
      }
      if (action === "increment" || action === "decrement") {
        const amount = getPositiveInteger(parsed.data.by, 1);
        if (amount === null) return failure("INVALID_AMOUNT", `by must be an integer between 1 and ${MAX_DELTA}.`, 400, headers);
        const delta = action === "decrement" ? -amount : amount;
        const row = await changeCounter(env.DB, id, delta);
        return success(row, 200, headers);
      }
      return failure("NOT_FOUND", "API endpoint not found.", 404, headers);
    } catch {
      return failure("DATABASE_ERROR", "The operation could not be completed. Check the counter range and database status.", 500, headers);
    }
  }
};
