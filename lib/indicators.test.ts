import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRSI } from "@/lib/indicators";
import { assertClose } from "@/lib/testHelpers";

test("computeRSI returns all nulls until there is a full window", () => {
  assert.deepEqual(computeRSI([1, 2, 3], 3), [null, null, null]);
  assert.deepEqual(computeRSI([], 14), []);
});

test("computeRSI seeds with a simple average, then applies Wilder smoothing", () => {
  // Seed (period 2): changes +1, -1 -> avgGain 0.5, avgLoss 0.5 -> RSI 50.
  // Next +1: avgGain (0.5 + 1) / 2 = 0.75, avgLoss 0.5 / 2 = 0.25 -> RS 3 -> 75.
  const rsi = computeRSI([1, 2, 1, 2], 2);
  assert.equal(rsi[0], null);
  assert.equal(rsi[1], null);
  assertClose(rsi[2] as number, 50);
  assertClose(rsi[3] as number, 75);
});

test("computeRSI is 100 for only gains and 0 for only losses", () => {
  const up = Array.from({ length: 20 }, (_, i) => 100 + i);
  const down = [...up].reverse();
  assert.equal(computeRSI(up, 14).at(-1), 100);
  assert.equal(computeRSI(down, 14).at(-1), 0);
});

test("computeRSI stays within 0-100 and aligns 1:1 with the input", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 3) + (i % 4));
  const rsi = computeRSI(closes, 14);
  assert.equal(rsi.length, closes.length);
  assert.ok(rsi.slice(0, 14).every((v) => v === null));
  for (const v of rsi.slice(14)) {
    assert.ok(v !== null && v >= 0 && v <= 100, `RSI out of range: ${v}`);
  }
});
