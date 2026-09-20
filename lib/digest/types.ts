// Change since the previous morning snapshot (see lib/digest/snapshot.ts),
// not today's intraday changePercent. Null when there's no prior entry for
// the symbol (first run, or a symbol new to the watchlist).
export interface RowDelta {
  scoreDelta: number;
  rsiDelta: number;
  priceChangePercent: number;
}

export interface DigestRow {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  rsi: number;
  oversold: boolean;
  overbought: boolean;
  score: number;
  allFactorsStrong: boolean;
  delta: RowDelta | null;
  grades: {
    valuation: number;
    growth: number;
    profitability: number;
    momentum: number;
    epsRevenue: number;
  };
  thesis: string;
  businessSummary: string | null;
  caution: string;
  targetPrice: number;
  stopLoss: number;
  horizonDays: number;
}

export interface DigestSkip {
  symbol: string;
  reason: string;
}

export interface MarketBenchmark {
  symbol: string;
  label: string;
  price: number;
  changePercent: number;
}

export interface MarketBriefing {
  benchmarks: MarketBenchmark[];
  summary: string;
}

export interface MarketSentiment {
  label: "Bullish" | "Neutral" | "Bearish";
  score: number;
  breadthPct: number;
  avgRsi: number;
  oversoldCount: number;
  overboughtCount: number;
  summary: string;
}

// A time-sensitive calendar item worth flagging before it happens. Only
// `earnings` today (from Finnhub's earnings calendar, filtered to the
// watchlist), but the shape leaves room for dividends / macro events later.
export interface UpcomingEvent {
  symbol: string;
  name: string;
  type: "earnings";
  date: string; // YYYY-MM-DD
  daysUntil: number; // 0 = today, 1 = tomorrow
  when: string; // "before open" | "after close" | "during hours" | ""
  epsEstimate: number | null;
  revenueEstimate: number | null;
  note: string; // plain-English one-liner
}

// A third-party news headline surfaced as an "interesting read". Unlike the
// rest of the digest (all self-computed), these are external articles —
// ranked deterministically by recency + keyword signal, not editorialized.
export interface NewsHighlight {
  headline: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
  summary: string;
  category: string; // "Market" for general news, else the ticker it's about
}

export interface DigestResult {
  scannedAt: string;
  watchlistSize: number;
  marketBriefing: MarketBriefing;
  marketSentiment: MarketSentiment;
  upcomingEvents: UpcomingEvent[];
  newsHighlights: NewsHighlight[];
  standouts: DigestRow[];
  rows: DigestRow[];
  skipped: DigestSkip[];
}

// --- Midday market update ---------------------------------------------------
// A lighter intraday run: live quotes only, no FMP fundamentals/history, so
// no RSI, projections, targets, or scores (those all come from daily EOD
// data that doesn't move through the trading day). See lib/digest/midday.ts.

export interface MiddayQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

export interface MiddayPulse {
  label: "Bullish" | "Neutral" | "Bearish";
  score: number;
  breadthPct: number;
  upCount: number;
  downCount: number;
  benchmarkAvgChange: number;
  summary: string;
}

export interface MiddayResult {
  scannedAt: string;
  watchlistSize: number;
  quotedCount: number;
  marketBriefing: MarketBriefing;
  pulse: MiddayPulse;
  gainers: MiddayQuote[];
  losers: MiddayQuote[];
  quotes: MiddayQuote[];
  newsHighlights: NewsHighlight[];
  skipped: DigestSkip[];
}
