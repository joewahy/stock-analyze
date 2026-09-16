// Fixture-backed replacement for global fetch, so the full pipeline (scan,
// grading, projections, email rendering) can run without hitting
// Finnhub/FMP or spending free-tier request budget. Enable with `--mock` on
// scripts/run-digest.ts, or call installMockFetch() directly in a test.
// Every symbol's data is deterministic, seeded from its ticker, so re-runs
// are stable and diffable.
import { DEFAULT_WATCHLIST } from "@/lib/digest/watchlist";

function seed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

// mulberry32: small, deterministic, good enough for fixture data.
function rngFor(key: string): () => number {
  let a = seed(key);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface RawPricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const HISTORY_DAYS = 380; // > 252-session 52-week window + RSI/projection warmup
const historyCache = new Map<string, RawPricePoint[]>();

function historyFor(symbol: string): RawPricePoint[] {
  let history = historyCache.get(symbol);
  if (history) return history;

  const rand = rngFor(`${symbol}:history`);
  const drift = (rand() - 0.45) * 0.0012;
  const vol = 0.012 + rand() * 0.018;
  let price = 15 + rand() * 400;
  const startMs = Date.now() - HISTORY_DAYS * 86_400_000;

  history = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    price = Math.max(1, price * (1 + drift + (rand() - 0.5) * vol * 2));
    history.push({
      date: new Date(startMs + i * 86_400_000).toISOString().slice(0, 10),
      open: round2(price * (1 - vol * 0.2)),
      high: round2(price * (1 + vol * 0.3)),
      low: round2(price * (1 - vol * 0.3)),
      close: round2(price),
      volume: Math.round(1_000_000 + rand() * 8_000_000),
    });
  }
  historyCache.set(symbol, history);
  return history;
}

function quoteResponse(symbol: string) {
  const history = historyFor(symbol);
  const last = history[history.length - 1];
  const prev = history[history.length - 2] ?? last;
  const change = round2(last.close - prev.close);
  return {
    c: last.close,
    d: change,
    dp: round2((change / prev.close) * 100),
    h: last.high,
    l: last.low,
    o: last.open,
    pc: prev.close,
    t: Math.floor(Date.now() / 1000),
  };
}

const SECTORS = [
  "Technology",
  "Consumer Discretionary",
  "Healthcare",
  "Financials",
  "Industrials",
  "Communication Services",
  "Consumer Staples",
  "Energy",
];

function profileResponse(symbol: string) {
  const rand = rngFor(`${symbol}:profile`);
  const sector = SECTORS[Math.floor(rand() * SECTORS.length)];
  return [
    {
      companyName: `${symbol} Holdings, Inc.`,
      exchangeFullName: "NASDAQ Global Select",
      industry: `${sector} Services`,
      sector,
      marketCap: Math.round(5e9 + rand() * 4e11),
      sharesOutstanding: Math.round(1e8 + rand() * 4e9),
      image: null,
      website: `https://www.${symbol.toLowerCase()}.example.com`,
      description:
        `${symbol} Holdings, Inc. is a fixture standing in for a real company ` +
        "profile, generated for local testing so the digest can render a " +
        "business summary without calling FMP.",
      currency: "USD",
      beta: round2(0.6 + rand() * 1.2),
    },
  ];
}

function ratiosResponse(symbol: string) {
  const rand = rngFor(`${symbol}:ratios`);
  return [
    {
      priceToEarningsRatioTTM: round2(8 + rand() * 35),
      priceToEarningsGrowthRatioTTM: round2(0.5 + rand() * 2.5),
      priceToSalesRatioTTM: round2(0.8 + rand() * 12),
      priceToFreeCashFlowRatioTTM: round2(8 + rand() * 30),
      enterpriseValueMultipleTTM: round2(6 + rand() * 20),
      grossProfitMarginTTM: round2(0.2 + rand() * 0.6),
      operatingProfitMarginTTM: round2(0.05 + rand() * 0.35),
      netProfitMarginTTM: round2(0.03 + rand() * 0.3),
      returnOnEquityTTM: round2(0.05 + rand() * 0.35),
      returnOnAssetsTTM: round2(0.02 + rand() * 0.2),
      dividendYielTTM: round2(rand() * 0.03),
    },
  ];
}

function metricsResponse(symbol: string) {
  const rand = rngFor(`${symbol}:metrics`);
  return [
    {
      peRatioTTM: round2(8 + rand() * 35),
      pegRatioTTM: round2(0.5 + rand() * 2.5),
      evToEBITDATTM: round2(6 + rand() * 20),
      returnOnEquityTTM: round2(0.05 + rand() * 0.35),
      returnOnAssetsTTM: round2(0.02 + rand() * 0.2),
    },
  ];
}

function incomeStatementResponse(symbol: string, limit: number) {
  const rand = rngFor(`${symbol}:income`);
  const yoyGrowth = (rand() - 0.4) * 0.3; // most-recent-year YoY, compounded backward
  const year = new Date().getUTCFullYear();
  let revenue = 2e9 + rand() * 8e10;

  const rows = [];
  for (let i = 0; i < limit; i++) {
    const fiscalYear = year - i;
    const netMargin = 0.05 + rand() * 0.25;
    const netIncome = revenue * netMargin;
    const shares = 1e9;
    rows.push({
      date: `${fiscalYear}-12-31`,
      fiscalYear: String(fiscalYear),
      period: "FY",
      revenue: round2(revenue),
      costOfRevenue: round2(revenue * 0.55),
      grossProfit: round2(revenue * 0.45),
      researchAndDevelopmentExpenses: round2(revenue * 0.08),
      sellingGeneralAndAdministrativeExpenses: round2(revenue * 0.12),
      operatingExpenses: round2(revenue * 0.2),
      operatingIncome: round2(revenue * 0.18),
      totalOtherIncomeExpensesNet: round2(revenue * 0.01),
      incomeBeforeTax: round2(netIncome * 1.25),
      incomeTaxExpense: round2(netIncome * 0.25),
      netIncome: round2(netIncome),
      ebitda: round2(revenue * 0.25),
      ebit: round2(revenue * 0.2),
      eps: round2(netIncome / shares),
      epsDiluted: round2(netIncome / (shares * 1.02)),
      weightedAverageShsOut: Math.round(shares),
      weightedAverageShsOutDil: Math.round(shares * 1.02),
    });
    revenue = revenue / (1 + yoyGrowth);
  }
  return rows;
}

function earningsSurprisesResponse(symbol: string) {
  const rand = rngFor(`${symbol}:earnings`);
  const now = new Date();
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i * 3, 1));
    const estimate = round2(0.5 + rand() * 3);
    const surprisePercent = round2((rand() - 0.3) * 20);
    rows.push({
      actual: round2(estimate * (1 + surprisePercent / 100)),
      estimate,
      period: period.toISOString().slice(0, 10),
      surprisePercent,
    });
  }
  return rows;
}

function earningsCalendarResponse(fromISO: string, toISO: string) {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  const spanDays = Math.max(1, Math.round((to - from) / 86_400_000));
  const rand = rngFor(`calendar:${fromISO}:${toISO}`);

  const picks = [...DEFAULT_WATCHLIST].sort(() => rand() - 0.5).slice(0, 4);
  const earningsCalendar = picks.map((symbol) => {
    const offset = 1 + Math.floor(rand() * spanDays);
    const date = new Date(from + offset * 86_400_000);
    const dateISO = date.toISOString().slice(0, 10);
    return {
      date: dateISO,
      epsActual: null,
      epsEstimate: round2(0.5 + rand() * 3),
      hour: ["bmo", "amc", "dmh"][Math.floor(rand() * 3)],
      quarter: Math.ceil((date.getUTCMonth() + 1) / 3),
      revenueActual: null,
      revenueEstimate: Math.round(1e9 + rand() * 5e10),
      symbol,
      year: date.getUTCFullYear(),
    };
  });
  return { earningsCalendar };
}

const HEADLINE_TEMPLATES: ((s: string) => string)[] = [
  (s) => `${s} raises full-year guidance after strong quarter`,
  (s) => `${s} unveils new product lineup at industry event`,
  (s) => `Analysts upgrade ${s} price target on demand outlook`,
  (s) => `${s} announces expanded share buyback program`,
  (s) => `${s} faces regulatory probe over pricing practices`,
];
const SOURCES = ["Reuters", "Bloomberg", "MockWire"];

function newsResponse(key: string, count: number) {
  const rand = rngFor(`${key}:news`);
  const nowSec = Math.floor(Date.now() / 1000);
  const items = [];
  for (let i = 0; i < count; i++) {
    const template = HEADLINE_TEMPLATES[Math.floor(rand() * HEADLINE_TEMPLATES.length)];
    items.push({
      id: Math.floor(rand() * 1e9),
      headline: template(key),
      summary:
        `Fixture summary for ${key}: generated stand-in content for a real ` +
        "news wire story, long enough to exercise summary truncation.",
      source: SOURCES[Math.floor(rand() * SOURCES.length)],
      url: `https://example.com/news/${key.toLowerCase()}-${i}`,
      image: "",
      datetime: nowSec - Math.floor(rand() * 36 * 3600),
    });
  }
  return items;
}

function symbolParam(url: URL): string {
  return (url.searchParams.get("symbol") ?? "").toUpperCase();
}

async function mockFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());

  if (url.hostname === "finnhub.io") {
    switch (url.pathname) {
      case "/api/v1/quote":
        return jsonResponse(quoteResponse(symbolParam(url)));
      case "/api/v1/company-news":
        return jsonResponse(newsResponse(symbolParam(url), 6));
      case "/api/v1/news":
        return jsonResponse(newsResponse("MARKET", 10));
      case "/api/v1/calendar/earnings":
        return jsonResponse(
          earningsCalendarResponse(
            url.searchParams.get("from") ?? "",
            url.searchParams.get("to") ?? ""
          )
        );
      case "/api/v1/stock/earnings":
        return jsonResponse(earningsSurprisesResponse(symbolParam(url)));
    }
  }

  if (url.hostname === "financialmodelingprep.com") {
    switch (url.pathname) {
      case "/stable/profile":
        return jsonResponse(profileResponse(symbolParam(url)));
      case "/stable/ratios-ttm":
        return jsonResponse(ratiosResponse(symbolParam(url)));
      case "/stable/key-metrics-ttm":
        return jsonResponse(metricsResponse(symbolParam(url)));
      case "/stable/income-statement":
        return jsonResponse(
          incomeStatementResponse(symbolParam(url), Number(url.searchParams.get("limit") ?? "5"))
        );
      case "/stable/historical-price-eod/full":
        return jsonResponse(historyFor(symbolParam(url)));
    }
  }

  throw new Error(`mockFetch: no fixture wired up for ${url.pathname}`);
}

export function installMockFetch(): void {
  process.env.FINNHUB_API_KEY ??= "mock-finnhub-key";
  process.env.FMP_API_KEY ??= "mock-fmp-key";
  globalThis.fetch = mockFetch as typeof fetch;
}
