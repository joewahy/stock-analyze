import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreFromCurve } from "./interpolate";
import { weightedAverage, type MetricScore } from "./types";
import { formatMultiple, formatPercent } from "./format";
import { VALUATION_CURVES } from "./thresholds";

test("scoreFromCurve clamps outside the curve and interpolates inside it", () => {
  const curve: [number, number][] = [[0, 0], [10, 100]];
  assert.equal(scoreFromCurve(-5, curve), 0);
  assert.equal(scoreFromCurve(50, curve), 100);
  assert.equal(scoreFromCurve(2.5, curve), 25);
  assert.equal(scoreFromCurve(10, curve), 100);
});

test("scoreFromCurve handles lower-is-better curves", () => {
  // P/E 10 sits halfway between [8, 100] and [12, 92].
  assert.equal(scoreFromCurve(10, VALUATION_CURVES.peRatio), 96);
  assert.ok(scoreFromCurve(15, VALUATION_CURVES.peRatio) > scoreFromCurve(40, VALUATION_CURVES.peRatio));
});

test("scoreFromCurve throws on an empty curve", () => {
  assert.throws(() => scoreFromCurve(1, []), /Empty score curve/);
});

function metric(score: number | null, weight: number): MetricScore {
  return { key: "k", label: "k", value: null, displayValue: "", score, weight };
}

test("weightedAverage skips null scores and zero weights", () => {
  assert.equal(weightedAverage([metric(80, 3), metric(40, 1), metric(null, 5), metric(0, 0)]), 70);
  assert.equal(weightedAverage([metric(null, 1), metric(90, 0)]), null);
  assert.equal(weightedAverage([]), null);
});

test("formatPercent and formatMultiple render N/A for null", () => {
  assert.equal(formatPercent(0.1234), "12.3%");
  assert.equal(formatPercent(null), "N/A");
  assert.equal(formatMultiple(18.25), "18.3x");
  assert.equal(formatMultiple(null), "N/A");
});
