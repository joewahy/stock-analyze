import { cached, TTL } from "@/lib/cache";
import { fetchWithRetry } from "./http";
import type { EarningsSurprise, NewsItem, Quote } from "./types";

const BASE_URL = "https://finnhub.io/api/v1";

function apiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not set");
  return key;
}

async function finnhubGet<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("token", apiKey());
  const res = await fetchWithRetry(url.toString(), { label: `Finnhub ${path}` });
  if (!res.ok) {
    throw new Error(`Finnhub ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface RawQuote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export async function getQuote(symbol: string): Promise<Quote> {
  return cached(`finnhub:quote:${symbol}`, TTL.QUOTE, async () => {
    const raw = await finnhubGet<RawQuote>("/quote", { symbol });
    if (raw.c === 0 && raw.pc === 0) {
      throw new Error(`No quote data for symbol "${symbol}"`);
    }
    return {
      price: raw.c,
      change: raw.d,
      changePercent: raw.dp,
      dayHigh: raw.h,
      dayLow: raw.l,
      open: raw.o,
      previousClose: raw.pc,
      timestamp: raw.t,
    };
  });
}

interface RawNews {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number;
}

export async function getCompanyNews(
  symbol: string,
  days = 14
): Promise<NewsItem[]> {
  return cached(`finnhub:news:${symbol}`, TTL.NEWS, async () => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const raw = await finnhubGet<RawNews[]>("/company-news", {
      symbol,
      from: fmt(from),
      to: fmt(to),
    });
    return raw
      .filter((n) => n.headline && n.url)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 20)
      .map((n) => ({
        id: n.id,
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        url: n.url,
        image: n.image || null,
        datetime: n.datetime,
      }));
  });
}

export async function getMarketNews(category = "general"): Promise<NewsItem[]> {
  return cached(`finnhub:marketNews:${category}`, TTL.NEWS, async () => {
    const raw = await finnhubGet<RawNews[]>("/news", { category });
    return raw
      .filter((n) => n.headline && n.url)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 50)
      .map((n) => ({
        id: n.id,
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        url: n.url,
        image: n.image || null,
        datetime: n.datetime,
      }));
  });
}

interface RawEarningsCalendar {
  earningsCalendar?: {
    date: string;
    epsActual: number | null;
    epsEstimate: number | null;
    hour: string;
    quarter: number;
    revenueActual: number | null;
    revenueEstimate: number | null;
    symbol: string;
    year: number;
  }[];
}

export interface EarningsCalendarItem {
  symbol: string;
  date: string;
  hour: string; // "bmo" | "amc" | "dmh" | ""
  epsEstimate: number | null;
  revenueEstimate: number | null;
  quarter: number;
  year: number;
}

// Finnhub's forward earnings calendar. Called once per digest run with a
// date range (no symbol) and filtered to the watchlist downstream, so it's
// one request regardless of watchlist size.
export async function getEarningsCalendar(
  fromISO: string,
  toISO: string
): Promise<EarningsCalendarItem[]> {
  return cached(
    `finnhub:earningsCalendar:${fromISO}:${toISO}`,
    TTL.EARNINGS,
    async () => {
      const raw = await finnhubGet<RawEarningsCalendar>("/calendar/earnings", {
        from: fromISO,
        to: toISO,
      });
      return (raw.earningsCalendar ?? []).map((e) => ({
        symbol: e.symbol,
        date: e.date,
        hour: e.hour ?? "",
        epsEstimate: e.epsEstimate,
        revenueEstimate: e.revenueEstimate,
        quarter: e.quarter,
        year: e.year,
      }));
    }
  );
}

interface RawEarnings {
  actual: number | null;
  estimate: number | null;
  period: string;
  surprisePercent: number | null;
}

export async function getEarningsSurprises(
  symbol: string
): Promise<EarningsSurprise[]> {
  return cached(`finnhub:earnings:${symbol}`, TTL.EARNINGS, async () => {
    const raw = await finnhubGet<RawEarnings[]>("/stock/earnings", { symbol });
    return raw
      .map((e) => ({
        period: e.period,
        actualEps: e.actual,
        estimateEps: e.estimate,
        surprisePercent: e.surprisePercent,
      }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));
  });
}
