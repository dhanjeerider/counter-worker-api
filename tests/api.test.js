import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

class MockD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    let values = [];
    const db = this;
    return {
      bind(...args) { values = args; return this; },
      async first() {
        if (sql.includes("SELECT id, value, updated_at FROM counters WHERE id = ?")) {
          return db.rows.get(values[0]) || null;
        }
        if (sql.includes("RETURNING id, value, updated_at")) {
          const [id, value, updatedAt] = values;
          const existing = db.rows.get(id);
          const nextValue = sql.includes("value = counters.value + excluded.value")
            ? (existing?.value || 0) + value : value;
          const row = { id, value: nextValue, updated_at: updatedAt };
          db.rows.set(id, row);
          return row;
        }
        return null;
      },
      async all() {
        const limit = values[0];
        return { results: [...db.rows.values()].sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit) };
      },
      async run() {
        const existed = db.rows.delete(values[0]);
        return { meta: { changes: existed ? 1 : 0 } };
      }
    };
  }
}

function makeRequest(path, method = "GET", body, apiKey = "secret") {
  return new Request(`https://counter.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(apiKey === null ? {} : { "x-api-key": apiKey })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
const read = response => response.json();

test("health endpoint responds", async () => {
  const response = await worker.fetch(makeRequest("/health"), { DB: new MockD1() });
  const result = await read(response);
  assert.equal(response.status, 200);
  assert.equal(result.data.status, "ok");
});

test("reading a missing counter returns zero without creating a row", async () => {
  const DB = new MockD1();
  const response = await worker.fetch(makeRequest("/api/counter", "GET", undefined, null), { DB });
  const result = await read(response);
  assert.equal(result.data.value, 0);
  assert.equal(result.data.exists, false);
  assert.equal(DB.rows.size, 0);
});

test("increment and decrement update the default counter", async () => {
  const DB = new MockD1();
  const env = { DB, API_KEY: "secret" };
  const increment = await worker.fetch(makeRequest("/api/counter/increment", "POST", { by: 5 }), env);
  const decrement = await worker.fetch(makeRequest("/api/counter/decrement", "POST", { by: 2 }), env);
  assert.equal((await read(increment)).data.value, 5);
  assert.equal((await read(decrement)).data.value, 3);
});

test("named counters can be set and deleted", async () => {
  const DB = new MockD1();
  const env = { DB, API_KEY: "secret" };
  const set = await worker.fetch(makeRequest("/api/counters/page_views", "PUT", { value: 99 }), env);
  const remove = await worker.fetch(makeRequest("/api/counters/page_views", "DELETE"), env);
  assert.equal((await read(set)).data.value, 99);
  assert.equal((await read(remove)).data.deleted, true);
});

test("write endpoints reject an incorrect API key", async () => {
  const response = await worker.fetch(makeRequest("/api/counter/increment", "POST", {}, "wrong"), { DB: new MockD1(), API_KEY: "secret" });
  assert.equal(response.status, 401);
});

test("invalid increment values are rejected", async () => {
  const response = await worker.fetch(makeRequest("/api/counter/increment", "POST", { by: 0 }), { DB: new MockD1(), API_KEY: "secret" });
  const result = await read(response);
  assert.equal(response.status, 400);
  assert.equal(result.error.code, "INVALID_AMOUNT");
});


test("landing, docs and routes pages are served without a database binding", async () => {
  for (const path of ["/", "/docs", "/routes"]) {
    const response = await worker.fetch(makeRequest(path, "GET", undefined, null), {});
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(html, /Counter API/);
  }
});

test("API discovery returns the supported route catalogue without a database binding", async () => {
  const response = await worker.fetch(makeRequest("/api/routes", "GET", undefined, null), {});
  const result = await read(response);
  assert.equal(response.status, 200);
  assert.equal(result.data.name, "Counter Worker API");
  assert.ok(result.data.routes.some(route => route.path === "/api/counter/increment"));
});
