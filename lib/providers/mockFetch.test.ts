import { test } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch } from "./mockFetch";
import * as finnhub from "./finnhub";
import * as fmp from "./fmp";
import { runDailyScan } from "@/lib/digest/scan";
import { runMiddayScan } from "@/lib/digest/midday";
import { renderWeeklyRecapEmail } from "@/lib/email/weeklyEmail";

installMockFetch();

test("mocked provider calls resolve without network access", async () => {
  const [quote, profile, ratios, history, income, surprises, calendar] = await Promise.all([
    finnhub.getQuote("AAPL"),
    fmp.getCompanyProfile("AAPL"),
    fmp.getFundamentalRatios("AAPL"),
    fmp.getHistoricalPrices("AAPL"),
    fmp.getIncomeStatementHistory("AAPL"),
    finnhub.getEarningsSurprises("AAPL"),
    finnhub.getEarningsCalendar("2024-01-01", "2024-01-31"),
  ]);

  assert.ok(Number.isFinite(quote.price));
  assert.equal(profile.symbol, "AAPL");
  assert.ok(Number.isFinite(ratios.peRatioTTM ?? NaN));
  assert.ok(history.length > 300);
  assert.equal(income.length, 5);
  assert.equal(surprises.length, 8);
  assert.ok(Array.isArray(calendar));
});

test("mocked quote is deterministic per symbol, and differs across symbols", async () => {
  const first = await finnhub.getQuote("MSFT");
  const second = await finnhub.getQuote("MSFT");
  assert.equal(first.price, second.price);

  const other = await finnhub.getQuote("NVDA");
  assert.notEqual(first.price, other.price);
});

test("runDailyScan produces a full digest from mock data alone", async () => {
  const watchlist = ["AAPL", "MSFT", "GOOGL"];
  const result = await runDailyScan(watchlist);

  assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
  assert.equal(result.rows.length, watchlist.length);
  assert.ok(result.standouts.length > 0);
  for (const row of result.rows) {
    assert.ok(Number.isFinite(row.score));
    assert.ok(Number.isFinite(row.targetPrice));
  }
});

test("runDailyScan wires a prior snapshot into each row's delta", async () => {
  const watchlist = ["AAPL", "MSFT"];
  const withoutSnapshot = await runDailyScan(watchlist);
  assert.ok(withoutSnapshot.rows.every((r) => r.delta === null));

  const previousSnapshot = {
    scannedAt: "2024-01-01T00:00:00.000Z",
    bySymbol: Object.fromEntries(
      withoutSnapshot.rows.map((r) => [r.symbol, { score: r.score - 5, rsi: r.rsi + 2, price: r.price }])
    ),
  };
  const withSnapshot = await runDailyScan(watchlist, previousSnapshot);
  for (const row of withSnapshot.rows) {
    assert.ok(row.delta);
    assert.equal(Math.round(row.delta.scoreDelta), 5);
    assert.equal(Math.round(row.delta.rsiDelta), -2);
  }
});

test("renderWeeklyRecapEmail handles a missing week-start snapshot", async () => {
  const watchlist = ["AAPL", "MSFT"];
  const result = await runDailyScan(watchlist);
  const email = renderWeeklyRecapEmail(result, null);

  assert.match(email.subject, /weekly recap/);
  assert.match(email.text, /Not enough history yet/);
  assert.match(email.html, /Not enough history yet/);
});

test("renderWeeklyRecapEmail renders per-symbol deltas against a week-start snapshot", async () => {
  const watchlist = ["AAPL", "MSFT"];
  const result = await runDailyScan(watchlist);
  const weekStart = {
    scannedAt: "2024-01-01T00:00:00.000Z",
    bySymbol: Object.fromEntries(
      result.rows.map((r) => [r.symbol, { score: r.score - 5, rsi: r.rsi + 2, price: r.price * 0.95 }])
    ),
  };
  const withDeltas = await runDailyScan(watchlist, weekStart);
  const email = renderWeeklyRecapEmail(withDeltas, weekStart);

  assert.doesNotMatch(email.text, /Not enough history yet/);
  for (const row of withDeltas.rows) {
    assert.ok(row.delta);
  }
});

test("runMiddayScan produces quotes from mock data alone", async () => {
  const watchlist = ["AAPL", "MSFT", "GOOGL"];
  const result = await runMiddayScan(watchlist);

  assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
  assert.equal(result.quotedCount, watchlist.length);
  assert.ok(result.marketBriefing.benchmarks.length > 0);
});
