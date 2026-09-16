import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "./http";

const FAST = { baseDelayMs: 1, maxDelayMs: 5 };

// Replaces global fetch with a queue of canned responses (or errors) and
// silences the retry warnings.
function mockFetch(t: TestContext, queue: (Response | Error)[]) {
  t.mock.method(console, "warn", () => {});
  return t.mock.method(globalThis, "fetch", async () => {
    const next = queue.shift();
    if (!next) throw new Error("fetch called more times than expected");
    if (next instanceof Error) throw next;
    return next;
  });
}

test("fetchWithRetry returns a success without retrying", async (t) => {
  const fetch = mockFetch(t, [new Response("ok", { status: 200 })]);
  const res = await fetchWithRetry("https://example.test", FAST);
  assert.equal(res.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});

test("fetchWithRetry retries 429 and 5xx until it succeeds", async (t) => {
  const fetch = mockFetch(t, [
    new Response("", { status: 429 }),
    new Response("", { status: 503 }),
    new Response("ok", { status: 200 }),
  ]);
  const res = await fetchWithRetry("https://example.test", FAST);
  assert.equal(res.status, 200);
  assert.equal(fetch.mock.callCount(), 3);
});

test("fetchWithRetry does not retry 402 or 404", async (t) => {
  for (const status of [402, 404]) {
    const fetch = mockFetch(t, [new Response("", { status })]);
    const res = await fetchWithRetry("https://example.test", FAST);
    assert.equal(res.status, status);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test("fetchWithRetry returns the last response once retries run out", async (t) => {
  const fetch = mockFetch(t, [
    new Response("", { status: 429 }),
    new Response("", { status: 429 }),
    new Response("", { status: 429 }),
  ]);
  const res = await fetchWithRetry("https://example.test", { ...FAST, retries: 2 });
  assert.equal(res.status, 429);
  assert.equal(fetch.mock.callCount(), 3);
});

test("fetchWithRetry retries network errors and rethrows the last one", async (t) => {
  const recovered = mockFetch(t, [new TypeError("fetch failed"), new Response("ok", { status: 200 })]);
  assert.equal((await fetchWithRetry("https://example.test", FAST)).status, 200);
  assert.equal(recovered.mock.callCount(), 2);
  recovered.mock.restore();

  mockFetch(t, [new TypeError("fetch failed"), new TypeError("fetch failed")]);
  await assert.rejects(
    fetchWithRetry("https://example.test", { ...FAST, retries: 1 }),
    /fetch failed/
  );
});

test("fetchWithRetry caps Retry-After at maxDelayMs", async (t) => {
  mockFetch(t, [
    new Response("", { status: 429, headers: { "retry-after": "60" } }),
    new Response("ok", { status: 200 }),
  ]);
  const started = Date.now();
  await fetchWithRetry("https://example.test", FAST);
  assert.ok(Date.now() - started < 1_000);
});
