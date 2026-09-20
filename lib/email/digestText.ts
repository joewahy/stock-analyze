import type { DigestResult } from "@/lib/digest/types";
import { fmtCurrency, fmtDelta, fmtPct, relativeTime } from "./emailTheme";
import { flagFor } from "./digestHtml";

export function renderDigestText(result: DigestResult): string {
  const lines: string[] = ["🌅 morning", ""];

  lines.push("MARKET BRIEFING");
  for (const b of result.marketBriefing.benchmarks) {
    lines.push(`  ${b.label}: ${fmtCurrency(b.price)} (${fmtPct(b.changePercent)})`);
  }
  lines.push(`  ${result.marketBriefing.summary}`);
  lines.push("");

  lines.push(`MARKET SENTIMENT: ${result.marketSentiment.label}`);
  lines.push(`  ${result.marketSentiment.summary}`);
  lines.push("");

  lines.push("UPCOMING EVENTS (next 14 days)");
  if (result.upcomingEvents.length === 0) {
    lines.push("  No watchlist earnings scheduled in the next 14 days.");
  } else {
    for (const e of result.upcomingEvents) {
      lines.push(`  ${e.daysUntil <= 1 ? "! " : "  "}${e.note}`);
    }
    lines.push("  (Earnings dates from Finnhub's calendar and can shift.)");
  }
  lines.push("");

  lines.push("STANDOUTS");
  if (result.standouts.length === 0) {
    lines.push("  None today.");
  } else {
    for (const c of result.standouts) {
      const rsiDelta = c.delta ? ` (${fmtDelta(c.delta.rsiDelta)})` : "";
      const scoreDelta = c.delta ? ` (${fmtDelta(c.delta.scoreDelta)})` : "";
      lines.push(`${c.symbol} — ${c.name}${c.allFactorsStrong ? " [★ STRONG SIGNAL]" : ""}`);
      lines.push(
        `  ${fmtCurrency(c.price)} (${fmtPct(c.changePercent)}) · RSI(14) ${c.rsi.toFixed(
          0
        )}${rsiDelta} · score ${c.score.toFixed(0)}/100${scoreDelta}${
          flagFor(c) ? ` · ${flagFor(c)}` : ""
        }`
      );
      lines.push(`  ${c.thesis}`);
      if (c.businessSummary) {
        lines.push(`  What they do: ${c.businessSummary}`);
      }
      lines.push(`  Worth watching: ${c.caution}`);
      lines.push(
        `  Target (${c.horizonDays}d): ${fmtCurrency(c.targetPrice)} · Stop-loss: ${fmtCurrency(
          c.stopLoss
        )}`
      );
      lines.push(
        `  Valuation ${c.grades.valuation.toFixed(0)} / Growth ${c.grades.growth.toFixed(
          0
        )} / Profitability ${c.grades.profitability.toFixed(
          0
        )} / Momentum ${c.grades.momentum.toFixed(0)} / EPS&Rev ${c.grades.epsRevenue.toFixed(0)}`
      );
      lines.push("");
    }
  }

  lines.push("INTERESTING READS");
  if (result.newsHighlights.length === 0) {
    lines.push("  No notable headlines surfaced today.");
  } else {
    for (const n of result.newsHighlights) {
      lines.push(`- ${n.headline}`);
      lines.push(`  ${n.category} · ${n.source} · ${relativeTime(n.datetime)}`);
      if (n.summary) lines.push(`  ${n.summary}`);
      lines.push(`  ${n.url}`);
      lines.push("");
    }
  }
  lines.push("");

  const standoutSymbols = new Set(result.standouts.map((r) => r.symbol));
  lines.push(`FULL WATCHLIST (${result.rows.length})`);
  for (const r of result.rows) {
    const star = standoutSymbols.has(r.symbol) ? "* " : "  ";
    const flag = flagFor(r);
    const scoreDelta = r.delta ? ` (${fmtDelta(r.delta.scoreDelta)})` : "";
    lines.push(
      `${star}${r.symbol.padEnd(6)} ${fmtCurrency(r.price).padStart(9)} ${fmtPct(
        r.changePercent
      ).padStart(8)}  RSI ${r.rsi.toFixed(0).padStart(3)}  score ${r.score
        .toFixed(0)
        .padStart(3)}${scoreDelta}${flag ? `  ${flag}` : ""}`
    );
  }
  lines.push("");

  if (result.skipped.length > 0) {
    lines.push("Not scored (data gaps):");
    lines.push(result.skipped.map((s) => `${s.symbol} (${s.reason})`).join(", "));
    lines.push("");
  }

  lines.push(
    "Target/stop are a statistical 30-day +/-1 std-dev band from historical volatility, not a guarantee. Market sentiment is a deterministic breadth/RSI/benchmark gauge, not a third-party index. Upcoming events are watchlist earnings dates from Finnhub's calendar (can shift). Interesting reads are third-party headlines, ranked by recency/keywords, not endorsements. Deltas in parentheses are vs. the previous morning digest, blank for a symbol with no prior run. NFA."
  );

  return lines.join("\n");
}
