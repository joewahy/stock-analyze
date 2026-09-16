import { cached, TTL } from "@/lib/cache";
import { byDateAsc } from "@/lib/util";
import { fetchWithRetry } from "./http";
import type {
  CompanyProfile,
  FundamentalRatios,
  HistoricalPricePoint,
  IncomeStatementPoint,
} from "./types";

const BASE_URL = "https://financialmodelingprep.com/stable";

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY is not set");
  return key;
}

async function fmpGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", apiKey());
  const res = await fetchWithRetry(url.toString(), { label: `FMP ${path}` });
  if (!res.ok) {
    throw new Error(`FMP ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// FMP has renamed fields across API versions (v3 -> stable). Rather than
// hard-code one exact key per metric and silently break if it doesn't
// match, try a list of known aliases and take the first defined number.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickNumber(obj: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickString(obj: any, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export async function getCompanyProfile(
  symbol: string
): Promise<CompanyProfile> {
  return cached(`fmp:profile:${symbol}`, TTL.FUNDAMENTALS, async () => {
    const raw = await fmpGet<Record<string, unknown>[] | Record<string, unknown>>(
      "/profile",
      { symbol }
    );
    const item = Array.isArray(raw) ? raw[0] : raw;
    if (!item) throw new Error(`No company profile for symbol "${symbol}"`);
    return {
      symbol,
      name: pickString(item, ["companyName", "name"]) ?? symbol,
      exchange: pickString(item, ["exchangeFullName", "exchange"]),
      industry: pickString(item, ["industry"]),
      sector: pickString(item, ["sector"]),
      marketCap: pickNumber(item, ["marketCap", "mktCap"]),
      sharesOutstanding: pickNumber(item, ["sharesOutstanding"]),
      logo: pickString(item, ["image"]),
      website: pickString(item, ["website"]),
      description: pickString(item, ["description"]),
      currency: pickString(item, ["currency"]),
      beta: pickNumber(item, ["beta"]),
    };
  });
}

export async function getFundamentalRatios(
  symbol: string
): Promise<FundamentalRatios> {
  return cached(`fmp:ratios:${symbol}`, TTL.FUNDAMENTALS, async () => {
    const [ratiosRaw, metricsRaw] = await Promise.all([
      fmpGet<Record<string, unknown>[] | Record<string, unknown>>(
        "/ratios-ttm",
        { symbol }
      ),
      fmpGet<Record<string, unknown>[] | Record<string, unknown>>(
        "/key-metrics-ttm",
        { symbol }
      ).catch(() => null),
    ]);
    const ratios = Array.isArray(ratiosRaw) ? ratiosRaw[0] : ratiosRaw;
    const metrics = metricsRaw
      ? Array.isArray(metricsRaw)
        ? metricsRaw[0]
        : metricsRaw
      : {};
    if (!ratios) throw new Error(`No ratios data for symbol "${symbol}"`);

    return {
      peRatioTTM: pickNumber(ratios, [
        "priceToEarningsRatioTTM",
        "peRatioTTM",
      ]) ?? pickNumber(metrics, ["peRatioTTM"]),
      pegRatioTTM:
        pickNumber(ratios, ["priceToEarningsGrowthRatioTTM", "pegRatioTTM"]) ??
        pickNumber(metrics, ["pegRatioTTM"]),
      priceToSalesRatioTTM: pickNumber(ratios, ["priceToSalesRatioTTM"]),
      priceToFreeCashFlowRatioTTM: pickNumber(ratios, [
        "priceToFreeCashFlowRatioTTM",
        "priceToFreeCashFlowsRatioTTM",
      ]),
      evToEbitdaTTM: pickNumber(metrics, [
        "evToEBITDATTM",
        "enterpriseValueOverEBITDATTM",
      ]) ?? pickNumber(ratios, ["enterpriseValueMultipleTTM"]),
      grossProfitMarginTTM: pickNumber(ratios, ["grossProfitMarginTTM"]),
      operatingProfitMarginTTM: pickNumber(ratios, [
        "operatingProfitMarginTTM",
      ]),
      netProfitMarginTTM: pickNumber(ratios, ["netProfitMarginTTM"]),
      returnOnEquityTTM:
        pickNumber(ratios, ["returnOnEquityTTM"]) ??
        pickNumber(metrics, ["returnOnEquityTTM"]),
      returnOnAssetsTTM:
        pickNumber(ratios, ["returnOnAssetsTTM"]) ??
        pickNumber(metrics, ["returnOnAssetsTTM"]),
      dividendYieldTTM: pickNumber(ratios, [
        "dividendYieldTTM",
        "dividendYielTTM",
      ]),
    };
  });
}

function mapIncomeStatementRow(r: Record<string, unknown>): IncomeStatementPoint {
  const fiscalYear = pickString(r, ["fiscalYear"]) ?? "";
  const rawPeriod = pickString(r, ["period"]) ?? "";
  const periodLabel = rawPeriod === "FY" ? fiscalYear : `${rawPeriod} ${fiscalYear}`.trim();
  return {
    date: pickString(r, ["date"]) ?? "",
    period: periodLabel,
    revenue: pickNumber(r, ["revenue"]),
    costOfRevenue: pickNumber(r, ["costOfRevenue"]),
    grossProfit: pickNumber(r, ["grossProfit"]),
    researchAndDevelopmentExpenses: pickNumber(r, ["researchAndDevelopmentExpenses"]),
    sellingGeneralAndAdministrativeExpenses: pickNumber(r, [
      "sellingGeneralAndAdministrativeExpenses",
    ]),
    operatingExpenses: pickNumber(r, ["operatingExpenses"]),
    operatingIncome: pickNumber(r, ["operatingIncome"]),
    totalOtherIncomeExpensesNet: pickNumber(r, ["totalOtherIncomeExpensesNet"]),
    incomeBeforeTax: pickNumber(r, ["incomeBeforeTax"]),
    incomeTaxExpense: pickNumber(r, ["incomeTaxExpense"]),
    netIncome: pickNumber(r, ["netIncome"]),
    ebitda: pickNumber(r, ["ebitda"]),
    ebit: pickNumber(r, ["ebit"]),
    eps: pickNumber(r, ["eps"]),
    epsDiluted: pickNumber(r, ["epsDiluted", "epsdiluted"]),
    weightedAverageShsOut: pickNumber(r, ["weightedAverageShsOut"]),
    weightedAverageShsOutDil: pickNumber(r, ["weightedAverageShsOutDil"]),
  };
}

export async function getIncomeStatementHistory(
  symbol: string,
  period: "annual" | "quarter" = "annual",
  limit = 5
): Promise<IncomeStatementPoint[]> {
  return cached(`fmp:income:${symbol}:${period}:${limit}`, TTL.FUNDAMENTALS, async () => {
    const raw = await fmpGet<Record<string, unknown>[]>("/income-statement", {
      symbol,
      period,
      limit: String(limit),
    });
    return raw.map(mapIncomeStatementRow);
  });
}

export async function getHistoricalPrices(
  symbol: string,
  days = 1830 // ~5 years
): Promise<HistoricalPricePoint[]> {
  return cached(`fmp:history:${symbol}`, TTL.HISTORY, async () => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const raw = await fmpGet<
      Record<string, unknown>[] | { historical?: Record<string, unknown>[] }
    >("/historical-price-eod/full", {
      symbol,
      from: fmt(from),
      to: fmt(to),
    });
    const list = Array.isArray(raw) ? raw : raw.historical ?? [];
    return list
      .map((p) => {
        const close = pickNumber(p, ["close"]) ?? 0;
        return {
          date: pickString(p, ["date"]) ?? "",
          open: pickNumber(p, ["open"]) ?? close,
          high: pickNumber(p, ["high"]) ?? close,
          low: pickNumber(p, ["low"]) ?? close,
          close,
          volume: pickNumber(p, ["volume"]) ?? 0,
        };
      })
      .filter((p) => p.date && p.close > 0)
      .sort(byDateAsc);
  });
}
