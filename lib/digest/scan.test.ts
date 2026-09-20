import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDelta, computeStandoutScore } from "./scan";
import { assertClose } from "@/lib/testHelpers";

const range = { low: 100, high: 200 };

test("computeStandoutScore weights oversold 40%, proximity to low 30%, fundamentals 30%", () => {
  // RSI 30 -> oversold 40; price at the low -> proximity 100.
  const s = computeStandoutScore({ rsi: 30, price: 100, range, fundamentalFloor: 70 });
  assertClose(s.score, 0.4 * 40 + 0.3 * 100 + 0.3 * 70);
  assert.equal(s.allFactorsStrong, false);
});

test("computeStandoutScore gives no oversold credit at RSI 50 and above", () => {
  const s = computeStandoutScore({ rsi: 65, price: 200, range, fundamentalFloor: 80 });
  assertClose(s.score, 0.3 * 80);
});

test("computeStandoutScore clamps price outside the 52-week range", () => {
  const below = computeStandoutScore({ rsi: 50, price: 90, range, fundamentalFloor: 0 });
  const above = computeStandoutScore({ rsi: 50, price: 250, range, fundamentalFloor: 0 });
  assertClose(below.score, 30);
  assertClose(above.score, 0);
});

test("computeStandoutScore gives no proximity credit without a usable range", () => {
  assert.equal(computeStandoutScore({ rsi: 50, price: 100, range: null, fundamentalFloor: 0 }).score, 0);
  const flat = { low: 100, high: 100 };
  assert.equal(computeStandoutScore({ rsi: 50, price: 100, range: flat, fundamentalFloor: 0 }).score, 0);
});

test("computeStandoutScore flags allFactorsStrong only when all three clear 60", () => {
  // RSI 20 -> oversold 60; price at low -> 100; floor 60.
  assert.equal(computeStandoutScore({ rsi: 20, price: 100, range, fundamentalFloor: 60 }).allFactorsStrong, true);
  assert.equal(computeStandoutScore({ rsi: 20, price: 100, range, fundamentalFloor: 59 }).allFactorsStrong, false);
});

test("computeDelta is null without a prior snapshot entry", () => {
  assert.equal(computeDelta(undefined, { score: 50, rsi: 40, price: 100 }), null);
});

test("computeDelta diffs score/RSI and computes price % change vs. the prior entry", () => {
  const delta = computeDelta(
    { score: 42, rsi: 50, price: 100 },
    { score: 55, rsi: 44, price: 110 }
  );
  assert.ok(delta);
  assertClose(delta.scoreDelta, 13);
  assertClose(delta.rsiDelta, -6);
  assertClose(delta.priceChangePercent, 10);
});
