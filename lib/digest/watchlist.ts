// Default universe for the daily digest scan. Deliberately a curated list
// of liquid large-caps rather than a full index — keeps the scan well
// within free-tier FMP/Finnhub request budgets. Edit freely.
//
// FMP's free "stable" plan 402s /historical-price-eod for a surprising
// (and seemingly arbitrary) subset of large-caps — confirmed gated at time
// of writing: AVGO, ORCL, CRM, HD, MCD, LLY, MA, CAT, PG, ABT, TMO, LIN,
// ACN, TXN, QCOM, LOW, TJX, BKNG, IBM. They're deliberately left out below;
// re-check with a quick curl to historical-price-eod before adding a new
// symbol back in, since a gated symbol just gets silently skipped (with a
// "Price data unavailable (402)" reason) rather than breaking the scan.
export const DEFAULT_WATCHLIST: string[] = [
  // Tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "ADBE", "CSCO", "INTC", "TSLA",
  // Consumer
  "WMT", "NKE", "SBUX", "COST", "KO", "PEP",
  // Healthcare
  "UNH", "JNJ", "PFE", "ABBV",
  // Financials
  "JPM", "BAC", "GS", "V",
  // Industrials / energy
  "XOM", "CVX", "GE", "BA",
  // Communication services
  "DIS", "NFLX", "T",
  // Growth / momentum
  "RDDT", "NBIS", "IREN",
];
