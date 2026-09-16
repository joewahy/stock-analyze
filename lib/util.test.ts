import { test } from "node:test";
import assert from "node:assert/strict";
import { byDateAsc, clamp, mapWithConcurrency } from "@/lib/util";

test("clamp bounds a value on both sides", () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(7, 0, 10), 7);
});

test("byDateAsc sorts ISO dates ascending", () => {
  const rows = [{ date: "2024-03-01" }, { date: "2023-12-31" }, { date: "2024-01-15" }];
  assert.deepEqual(
    rows.sort(byDateAsc).map((r) => r.date),
    ["2023-12-31", "2024-01-15", "2024-03-01"]
  );
});

test("mapWithConcurrency preserves input order and respects the limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const result = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, n));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(result, [50, 10, 40, 20, 30]);
  assert.equal(maxInFlight, 2);
});

test("mapWithConcurrency handles an empty list and a limit above the item count", async () => {
  assert.deepEqual(await mapWithConcurrency([], 5, async (n: number) => n), []);
  assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (n) => n + 1), [2, 3]);
});
