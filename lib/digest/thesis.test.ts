import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaution, buildThesis, summarizeBusiness } from "./thesis";
import type { GradeResult, MetricScore, StockGrades } from "@/lib/grading";

function metric(label: string, score: number, displayValue: string): MetricScore {
  return { key: label, label, value: null, displayValue, score, weight: 1 };
}

function grade(
  category: string,
  score: number,
  metrics: MetricScore[] = [],
  insufficientData = false
): GradeResult {
  return { category, score, metrics, notes: [], insufficientData };
}

function grades(overrides: Partial<StockGrades> = {}): StockGrades {
  return {
    valuation: grade("Valuation", 50),
    growth: grade("Growth", 50),
    profitability: grade("Profitability", 50),
    momentum: grade("Momentum", 50),
    epsRevenue: grade("EPS & Revenue", 50),
    ...overrides,
  };
}

test("summarizeBusiness passes short descriptions through trimmed", () => {
  assert.equal(summarizeBusiness(null), null);
  assert.equal(summarizeBusiness(""), null);
  assert.equal(summarizeBusiness("  Makes phones.  "), "Makes phones.");
});

test("summarizeBusiness cuts long descriptions at a sentence boundary", () => {
  const first = `Acme designs ${"very ".repeat(16)}useful widgets.`;
  const result = summarizeBusiness(`${first} ${"More detail here. ".repeat(20)}`);
  assert.equal(result, `${first} ${"More detail here. ".repeat(6).trim()}`);
  assert.ok(result!.length <= 220);
});

test("summarizeBusiness falls back to a word boundary with an ellipsis", () => {
  const result = summarizeBusiness("word ".repeat(100))!;
  assert.ok(result.endsWith("word…"));
  assert.ok(result.length <= 221);
});

test("buildCaution names the weakest usable category and its worst metric", () => {
  const caution = buildCaution(
    grades({
      valuation: grade("Valuation", 5, [], true),
      growth: grade("Growth", 20, [
        metric("Revenue growth (YoY)", 10, "-3.0%"),
        metric("EPS growth (YoY)", 30, "1.0%"),
      ]),
    })
  );
  assert.ok(caution.startsWith("Growth is the weakest part of the case (20/100: revenue growth (yoy) -3.0%)"));
  assert.ok(caution.includes("growth has been sluggish"));
});

test("buildCaution falls back when every grade is too thin", () => {
  const thin = grade("x", 0, [], true);
  const caution = buildCaution({
    valuation: thin,
    growth: thin,
    profitability: thin,
    momentum: thin,
    epsRevenue: thin,
  });
  assert.ok(caution.startsWith("Fundamentals data was too thin"));
});

test("buildThesis covers price vs high, RSI band, strongest and weakest grade", () => {
  const thesis = buildThesis({
    symbol: "AAPL",
    price: 150,
    rsi: 25,
    rsiPeriod: 14,
    range: { low: 80, high: 200 },
    grades: grades({
      profitability: grade("Profitability", 90, [metric("Net margin", 95, "25.0%")]),
      growth: grade("Growth", 20),
    }),
  });
  assert.ok(thesis.startsWith("AAPL is trading at $150.00, 25% below its 52-week high of $200.00"));
  assert.ok(thesis.includes("RSI(14) at 25, deeply oversold"));
  assert.ok(thesis.includes("profitability is a strength (90/100: net margin 25.0%)"));
  assert.ok(thesis.includes("while growth lags (20/100)"));
  assert.ok(thesis.endsWith("a buy-the-dip setup on fundamentals that haven't broken."));
});

test("buildThesis picks the RSI band by value", () => {
  const phrase = (rsi: number) =>
    buildThesis({ symbol: "X", price: 1, rsi, rsiPeriod: 14, range: null, grades: grades() });
  assert.ok(phrase(30).includes("deeply oversold"));
  assert.ok(phrase(45).includes(", oversold"));
  assert.ok(phrase(54).includes("neutral momentum"));
  assert.ok(phrase(55).includes("firm momentum"));
  assert.ok(phrase(70).includes("overbought"));
});

test("buildThesis omits the range and the lag clause when there is nothing to compare", () => {
  const thin = grade("x", 0, [], true);
  const thesis = buildThesis({
    symbol: "X",
    price: 12.5,
    rsi: 50,
    rsiPeriod: 14,
    range: null,
    grades: { ...grades(), valuation: thin, growth: thin, momentum: thin, epsRevenue: thin },
  });
  assert.ok(thesis.startsWith("X is trading at $12.50, with RSI(14)"));
  assert.ok(!thesis.includes("lags"));
});
