import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProjection } from "@/lib/projection";
import { assertClose, pricesFromCloses } from "@/lib/testHelpers";

test("computeProjection flags insufficient data under 30 points", () => {
  assert.equal(computeProjection(null).insufficientData, true);
  const short = computeProjection(pricesFromCloses(Array(29).fill(100)));
  assert.equal(short.insufficientData, true);
  assert.deepEqual(short.points, []);
});

test("computeProjection collapses every band to the current price when prices are flat", () => {
  const p = computeProjection(pricesFromCloses(Array(60).fill(50)));
  assert.equal(p.insufficientData, false);
  assert.equal(p.annualizedVolatility, 0);
  assert.equal(p.annualizedDrift, 0);
  for (const pt of p.points) {
    for (const v of [pt.median, pt.upper1sd, pt.lower1sd, pt.upper2sd, pt.lower2sd]) {
      assertClose(v, 50);
    }
  }
});

test("computeProjection compounds a constant daily return into the median", () => {
  const g = 1.001;
  const closes = Array.from({ length: 100 }, (_, i) => 100 * g ** i);
  const p = computeProjection(pricesFromCloses(closes), 180, [30]);
  assertClose(p.annualizedVolatility, 0, 1e-9);
  assertClose(p.annualizedDrift, Math.log(g) * 252, 1e-9);
  assertClose(p.points[0].median, closes.at(-1)! * g ** 30, 1e-6);
});

test("computeProjection bands are ordered and symmetric in log space", () => {
  const closes = Array.from({ length: 120 }, (_, i) => 100 + 8 * Math.sin(i / 2) + i * 0.1);
  const p = computeProjection(pricesFromCloses(closes));
  assert.deepEqual(p.points.map((pt) => pt.daysAhead), [30, 60, 90]);
  for (const pt of p.points) {
    assert.ok(pt.lower2sd < pt.lower1sd && pt.lower1sd < pt.median);
    assert.ok(pt.median < pt.upper1sd && pt.upper1sd < pt.upper2sd);
    assertClose(pt.upper1sd * pt.lower1sd, pt.median ** 2, 1e-6);
  }
  // Wider horizon -> wider band.
  const width = (i: number) => p.points[i].upper1sd / p.points[i].lower1sd;
  assert.ok(width(0) < width(1) && width(1) < width(2));
});

test("computeProjection only uses the lookback window and sorts input by date", () => {
  const volatile = Array.from({ length: 50 }, (_, i) => (i % 2 ? 80 : 120));
  const flat = Array(50).fill(100);
  const history = pricesFromCloses([...volatile, ...flat]).reverse();
  const p = computeProjection(history, 50);
  assert.equal(p.lookbackDays, 50);
  assert.equal(p.annualizedVolatility, 0);
  assert.equal(p.currentPrice, 100);
  assert.equal(p.asOfDate, pricesFromCloses(Array(100).fill(1)).at(-1)!.date);
});
