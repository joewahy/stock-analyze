import { test } from "node:test";
import assert from "node:assert/strict";
import { averageChangePercent, computeMarketSentiment } from "./market";
import { computeMiddayPulse } from "./midday";
import { assertClose } from "@/lib/testHelpers";
import type { DigestRow, MarketBenchmark, MiddayQuote } from "./types";

function row(rsi: number, changePercent: number): DigestRow {
  return {
    symbol: "X",
    name: "X",
    price: 100,
    changePercent,
    rsi,
    oversold: false,
    overbought: false,
    score: 50,
    allFactorsStrong: false,
    delta: null,
    grades: { valuation: 50, growth: 50, profitability: 50, momentum: 50, epsRevenue: 50 },
    thesis: "",
    businessSummary: null,
    caution: "",
    targetPrice: 110,
    stopLoss: 90,
    horizonDays: 30,
  };
}

function benchmark(changePercent: number): MarketBenchmark {
  return { symbol: "SPY", label: "S&P 500", price: 500, changePercent };
}

test("averageChangePercent is the mean, or 0 when empty", () => {
  assert.equal(averageChangePercent([]), 0);
  assert.equal(averageChangePercent([{ changePercent: 1 }, { changePercent: -3 }]), -1);
});

test("computeMarketSentiment is Neutral with no rows", () => {
  const s = computeMarketSentiment([], [benchmark(2)]);
  assert.equal(s.label, "Neutral");
  assert.equal(s.score, 50);
});

test("computeMarketSentiment combines breadth, benchmarks and RSI", () => {
  const s = computeMarketSentiment(
    [row(25, 1), row(50, -1), row(75, 2), row(50, 0)],
    [benchmark(0.5), benchmark(-0.5)]
  );
  assert.equal(s.breadthPct, 50);
  assert.equal(s.avgRsi, 50);
  assert.equal(s.oversoldCount, 1);
  assert.equal(s.overboughtCount, 1);
  assertClose(s.score, 50);
  assert.equal(s.label, "Neutral");
});

test("computeMarketSentiment labels strong and weak tapes", () => {
  const bull = computeMarketSentiment([row(65, 1), row(65, 2)], [benchmark(2)]);
  // 0.4*100 + 0.3*70 + 0.3*65
  assertClose(bull.score, 80.5);
  assert.equal(bull.label, "Bullish");

  const bear = computeMarketSentiment([row(30, -1), row(30, -2)], [benchmark(-3)]);
  // 0.4*0 + 0.3*20 + 0.3*30
  assertClose(bear.score, 15);
  assert.equal(bear.label, "Bearish");
});

test("computeMarketSentiment clamps the benchmark term", () => {
  const s = computeMarketSentiment([row(50, 0)], [benchmark(20)]);
  // breadth 0, benchmark clamped to 100, RSI 50
  assertClose(s.score, 0.3 * 100 + 0.3 * 50);
});

function quote(changePercent: number): MiddayQuote {
  return { symbol: "X", name: "X", price: 100, changePercent };
}

test("computeMiddayPulse counts flat names as neither up nor down", () => {
  const p = computeMiddayPulse([quote(1), quote(1), quote(-1), quote(0)], 0);
  assert.equal(p.upCount, 2);
  assert.equal(p.downCount, 1);
  assert.equal(p.breadthPct, 50);
  assertClose(p.score, 50);
  assert.equal(p.label, "Neutral");
});

test("computeMiddayPulse is Neutral with no quotes but keeps the benchmark move", () => {
  const p = computeMiddayPulse([], -1.25);
  assert.equal(p.label, "Neutral");
  assert.equal(p.benchmarkAvgChange, -1.25);
});
