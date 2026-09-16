import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeValuation } from "./valuation";
import { gradeProfitability } from "./profitability";
import { gradeGrowth } from "./growth";
import { gradeMomentum } from "./momentum";
import { gradeEpsRevenue } from "./epsRevenue";
import { assertClose, pricesFromCloses } from "@/lib/testHelpers";
import type {
  EarningsSurprise,
  FundamentalRatios,
  IncomeStatementPoint,
} from "@/lib/providers/types";

// Every value sits exactly on a curve breakpoint so expected scores are exact.
function ratios(overrides: Partial<FundamentalRatios> = {}): FundamentalRatios {
  return {
    peRatioTTM: 18, // 78
    pegRatioTTM: 1.5, // 70
    priceToSalesRatioTTM: 5, // 60
    priceToFreeCashFlowRatioTTM: 25, // 62
    evToEbitdaTTM: 15, // 65
    grossProfitMarginTTM: 0.4, // 60
    operatingProfitMarginTTM: 0.15, // 65
    netProfitMarginTTM: 0.1, // 60
    returnOnEquityTTM: 0.15, // 65
    returnOnAssetsTTM: 0.07, // 65
    dividendYieldTTM: null,
    ...overrides,
  };
}

const allNullRatios: FundamentalRatios = Object.fromEntries(
  Object.keys(ratios()).map((k) => [k, null])
) as unknown as FundamentalRatios;

test("gradeValuation weights P/E and PEG on top of the other multiples", () => {
  const g = gradeValuation(ratios());
  assert.equal(g.insufficientData, false);
  // (78*3 + 70*2 + 60*2 + 62*2 + 65*2) / 11
  assertClose(g.score, 748 / 11);
});

test("gradeValuation drops P/E and PEG for unprofitable companies", () => {
  const g = gradeValuation(ratios({ peRatioTTM: -12 }));
  assertClose(g.score, (60 + 62 + 65) / 3);
  assert.ok(g.notes.some((n) => n.includes("No positive P/E")));
});

test("gradeValuation scores cheaper multiples higher", () => {
  const cheap = gradeValuation(ratios({ peRatioTTM: 10, priceToSalesRatioTTM: 2, evToEbitdaTTM: 8 }));
  const rich = gradeValuation(ratios({ peRatioTTM: 60, priceToSalesRatioTTM: 15, evToEbitdaTTM: 35 }));
  assert.ok(cheap.score > rich.score);
});

test("gradeValuation needs at least two scored metrics", () => {
  assert.equal(gradeValuation(null).insufficientData, true);
  const g = gradeValuation({ ...allNullRatios, priceToSalesRatioTTM: 3 });
  assert.equal(g.insufficientData, true);
});

test("gradeProfitability weights operating and net margin heaviest", () => {
  const g = gradeProfitability(ratios());
  // (60*2 + 65*3 + 60*3 + 65*2 + 65*2) / 12
  assertClose(g.score, 755 / 12);
  assert.equal(gradeProfitability(null).insufficientData, true);
  assert.equal(
    gradeProfitability({ ...allNullRatios, grossProfitMarginTTM: 0.5 }).insufficientData,
    true
  );
});

function income(date: string, revenue: number | null, eps: number | null): IncomeStatementPoint {
  return {
    date,
    period: date.slice(0, 4),
    revenue,
    eps,
    costOfRevenue: null,
    grossProfit: null,
    researchAndDevelopmentExpenses: null,
    sellingGeneralAndAdministrativeExpenses: null,
    operatingExpenses: null,
    operatingIncome: null,
    totalOtherIncomeExpensesNet: null,
    incomeBeforeTax: null,
    incomeTaxExpense: null,
    netIncome: null,
    ebitda: null,
    ebit: null,
    epsDiluted: null,
    weightedAverageShsOut: null,
    weightedAverageShsOutDil: null,
  };
}

test("gradeGrowth computes YoY and 3yr CAGR regardless of input order", () => {
  const history = [
    income("2022-12-31", 121, 1.21),
    income("2024-12-31", 146.41, 1.4641),
    income("2020-12-31", 100, 1),
    income("2023-12-31", 133.1, 1.331),
    income("2021-12-31", 110, 1.1),
  ];
  const g = gradeGrowth(history);
  const value = (key: string) => g.metrics.find((m) => m.key === key)!.value as number;
  assertClose(value("revenueGrowthYoY"), 0.1, 1e-9);
  assertClose(value("epsGrowthYoY"), 0.1, 1e-9);
  assertClose(value("revenueCAGR3yr"), 0.1, 1e-9);
  // (65*3 + 58*3 + 70*2) / 8
  assertClose(g.score, 509 / 8, 1e-6);
});

test("gradeGrowth skips YoY growth off a negative base and notes a missing CAGR", () => {
  const g = gradeGrowth([income("2024-12-31", 120, 0.5), income("2023-12-31", 100, -1)]);
  assert.equal(g.metrics.find((m) => m.key === "epsGrowthYoY")!.value, null);
  assert.equal(g.metrics.find((m) => m.key === "revenueCAGR3yr")!.value, null);
  assert.ok(g.notes.some((n) => n.includes("3-year revenue CAGR")));
  assert.equal(g.insufficientData, false);
  assert.equal(gradeGrowth([income("2024-12-31", 1, 1)]).insufficientData, true);
});

test("gradeMomentum scores a flat year at the curve midpoints", () => {
  const g = gradeMomentum(pricesFromCloses(Array(260).fill(100)));
  // Four 0% returns score 55, two at-the-average ratios score 60, all weight 2.
  assertClose(g.score, (55 * 4 + 60 * 2) / 6);
  assert.deepEqual(g.notes, []);
});

test("gradeMomentum grades what it can on short history", () => {
  assert.equal(gradeMomentum(pricesFromCloses(Array(21).fill(100))).insufficientData, true);
  const g = gradeMomentum(pricesFromCloses(Array(30).fill(100)));
  assert.equal(g.insufficientData, false);
  assert.equal(g.score, 55);
  assert.ok(g.notes.some((n) => n.includes("Fewer than 12 months")));
});

test("gradeMomentum ranks an uptrend above a downtrend", () => {
  const up = Array.from({ length: 260 }, (_, i) => 100 * 1.002 ** i);
  const down = Array.from({ length: 260 }, (_, i) => 100 * 0.998 ** i);
  assert.ok(gradeMomentum(pricesFromCloses(up)).score > gradeMomentum(pricesFromCloses(down)).score);
});

function quarter(actualEps: number | null, estimateEps: number | null, surprisePercent: number | null): EarningsSurprise {
  return { period: "2024-03-31", actualEps, estimateEps, surprisePercent };
}

test("gradeEpsRevenue computes beat rate (ties count) and average surprise", () => {
  const g = gradeEpsRevenue([
    quarter(1.1, 1.0, 10),
    quarter(1.0, 1.0, 0),
    quarter(1.1, 1.0, 10),
    quarter(0.98, 1.0, -2),
  ]);
  const value = (key: string) => g.metrics.find((m) => m.key === key)!.value as number;
  assert.equal(value("beatRate"), 0.75);
  assertClose(value("avgSurprisePercent"), 0.045);
});

test("gradeEpsRevenue only uses the 8 most recent quarters (provider returns newest first)", () => {
  const beats = Array.from({ length: 8 }, () => quarter(1.1, 1.0, 10));
  const oldMisses = [quarter(0.5, 1.0, -50), quarter(0.5, 1.0, -50)];
  const g = gradeEpsRevenue([...beats, ...oldMisses]);
  assert.equal(g.metrics.find((m) => m.key === "beatRate")!.value, 1);
  // Identical surprises -> perfectly consistent.
  assert.equal(g.metrics.find((m) => m.key === "consistency")!.value, 1);
});

test("gradeEpsRevenue is insufficient without usable actual/estimate pairs", () => {
  assert.equal(gradeEpsRevenue(null).insufficientData, true);
  assert.equal(gradeEpsRevenue([]).insufficientData, true);
  const g = gradeEpsRevenue([quarter(null, 1.0, null)]);
  assert.equal(g.insufficientData, true);
  assert.ok(g.notes[0].includes("missing actual/estimate"));
});
