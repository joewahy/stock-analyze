import { test } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch } from "./mockFetch";
import * as finnhub from "./finnhub";
import * as fmp from "./fmp";
import { runDailyScan } from "@/lib/digest/scan";
import { runMiddayScan } from "@/lib/digest/midday";

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

test("runMiddayScan produces quotes from mock data alone", async () => {
  const watchlist = ["AAPL", "MSFT", "GOOGL"];
  const result = await runMiddayScan(watchlist);

  assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
  assert.equal(result.quotedCount, watchlist.length);
  assert.ok(result.marketBriefing.benchmarks.length > 0);
});
