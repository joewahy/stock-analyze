import type { MiddayQuote, MiddayResult } from "@/lib/digest/types";
import {
  BODY,
  fmtCurrency,
  fmtPct,
  INK,
  MUTED,
  changeColor,
  h1,
  page,
  readsSection,
  relativeTime,
  section,
  type RenderedEmail,
} from "./emailTheme";
import { benchmarkTable, gaugeBadge, skippedList } from "./fragments";

export function renderMiddayEmail(result: MiddayResult): RenderedEmail {
  const subject = `☀️ afternoon - ${result.pulse.label} sentiment`;

  return {
    subject,
    html: renderHtml(result),
    text: renderText(result),
  };
}

function moverTable(quotes: MiddayQuote[]): string {
  if (quotes.length === 0) {
    return `<div style="font-size:13px;color:${MUTED};">None.</div>`;
  }
  const rows = quotes
    .map(
      (q) => `
      <tr>
        <td style="padding:4px 14px 4px 0;font-size:13px;color:${INK};font-weight:700;">${q.symbol}</td>
        <td style="padding:4px 14px 4px 0;font-size:13px;color:${INK};text-align:right;">${fmtCurrency(
          q.price
        )}</td>
        <td style="padding:4px 0;font-size:13px;font-weight:700;text-align:right;color:${changeColor(
          q.changePercent
        )};">${fmtPct(q.changePercent)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

function renderHtml(result: MiddayResult): string {
  const parts = [
    h1("☀️ afternoon"),
    section({
      label: "Benchmarks",
      body: `
        ${benchmarkTable(result.marketBriefing.benchmarks)}
        <div style="margin-top:10px;font-size:13px;color:${BODY};line-height:1.55;">${result.marketBriefing.summary}</div>`,
    }),
    section({
      label: "Intraday pulse",
      body: gaugeBadge(result.pulse),
    }),
    section({
      label: `Top gainers${result.gainers.length ? ` · ${result.gainers.length}` : ""}`,
      body: moverTable(result.gainers),
    }),
    section({
      label: `Top losers${result.losers.length ? ` · ${result.losers.length}` : ""}`,
      body: moverTable(result.losers),
    }),
  ];

  if (result.newsHighlights.length > 0) {
    parts.push(readsSection(result.newsHighlights, { note: "" }));
  }

  if (result.skipped.length > 0) {
    parts.push(
      section({
        label: "No live quote",
        body: skippedList(result.skipped),
      })
    );
  }

  return page(parts.join(""));
}

function renderText(result: MiddayResult): string {
  const lines: string[] = ["☀️ afternoon", ""];

  lines.push("BENCHMARKS");
  for (const b of result.marketBriefing.benchmarks) {
    lines.push(`  ${b.label}: ${fmtCurrency(b.price)} (${fmtPct(b.changePercent)})`);
  }
  lines.push(`  ${result.marketBriefing.summary}`);
  lines.push("");

  lines.push(`INTRADAY PULSE: ${result.pulse.label}`);
  lines.push(`  ${result.pulse.summary}`);
  lines.push("");

  const moverLines = (quotes: MiddayQuote[]) => {
    if (quotes.length === 0) {
      lines.push("  None.");
      return;
    }
    for (const q of quotes) {
      lines.push(
        `  ${q.symbol.padEnd(6)} ${fmtCurrency(q.price).padStart(9)} ${fmtPct(
          q.changePercent
        ).padStart(8)}`
      );
    }
  };

  lines.push("TOP GAINERS");
  moverLines(result.gainers);
  lines.push("");
  lines.push("TOP LOSERS");
  moverLines(result.losers);
  lines.push("");

  if (result.newsHighlights.length > 0) {
    lines.push("INTERESTING READS");
    for (const n of result.newsHighlights) {
      lines.push(`- ${n.headline}`);
      lines.push(`  ${n.category} · ${n.source} · ${relativeTime(n.datetime)}`);
      if (n.summary) lines.push(`  ${n.summary}`);
      lines.push(`  ${n.url}`);
      lines.push("");
    }
  }

  if (result.skipped.length > 0) {
    lines.push("No live quote (skipped):");
    lines.push(result.skipped.map((s) => `${s.symbol} (${s.reason})`).join(", "));
    lines.push("");
  }

  lines.push(
    "Intraday snapshot of live prices only — no RSI, scores, or targets (those are end-of-day; see the morning digest). Quotes via Finnhub, delayed per their free tier. Pulse is a deterministic breadth + benchmark gauge, not a third-party index. NFA."
  );

  return lines.join("\n");
}
