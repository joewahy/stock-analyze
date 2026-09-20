import type { DigestResult, DigestRow } from "@/lib/digest/types";
import type { Snapshot } from "@/lib/digest/snapshot";
import {
  BODY,
  changeColor,
  FAINT,
  fmtCurrency,
  fmtDelta,
  fmtPct,
  h1,
  HAIRLINE,
  INK,
  MUTED,
  page,
  section,
  type RenderedEmail,
} from "./emailTheme";
import { benchmarkTable, gaugeBadge, skippedList } from "./fragments";

const MOVERS_SHOWN = 5;

function weekOfLabel(weekStart: Snapshot | null): string {
  if (!weekStart) return "this week";
  const date = new Date(weekStart.scannedAt);
  return `week of ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  })}`;
}

// Rows with a delta, split into the biggest gainers and losers by whichever
// numeric field `pick` reads off the delta — shared by the price-move and
// score-move tables below.
function topMovers(
  rows: DigestRow[],
  pick: (row: DigestRow) => number
): { gainers: DigestRow[]; losers: DigestRow[] } {
  const withDelta = rows.filter((r) => r.delta !== null);
  const sorted = [...withDelta].sort((a, b) => pick(b) - pick(a));
  const gainers = sorted.filter((r) => pick(r) > 0).slice(0, MOVERS_SHOWN);
  const losers = sorted
    .filter((r) => pick(r) < 0)
    .slice(-MOVERS_SHOWN)
    .reverse();
  return { gainers, losers };
}

export function renderWeeklyRecapEmail(
  result: DigestResult,
  weekStart: Snapshot | null
): RenderedEmail {
  const subject = `📊 weekly recap - ${weekOfLabel(weekStart)}`;
  return {
    subject,
    html: renderHtml(result, weekStart),
    text: renderText(result, weekStart),
  };
}

function priceMoverRows(rows: DigestRow[]): string {
  return rows
    .map(
      (r) => `
      <tr>
        <td style="padding:4px 14px 4px 0;font-size:13px;color:${INK};font-weight:700;">${r.symbol}</td>
        <td style="padding:4px 14px 4px 0;font-size:13px;color:${INK};text-align:right;">${fmtCurrency(
          r.price
        )}</td>
        <td style="padding:4px 0;font-size:13px;font-weight:700;text-align:right;color:${changeColor(
          r.delta!.priceChangePercent
        )};">${fmtPct(r.delta!.priceChangePercent)}</td>
      </tr>`
    )
    .join("");
}

function scoreMoverRows(rows: DigestRow[]): string {
  return rows
    .map(
      (r) => `
      <tr>
        <td style="padding:4px 14px 4px 0;font-size:13px;color:${INK};font-weight:700;">${r.symbol}</td>
        <td style="padding:4px 14px 4px 0;font-size:13px;color:${INK};text-align:right;">${r.score.toFixed(
          0
        )}</td>
        <td style="padding:4px 0;font-size:13px;font-weight:700;text-align:right;color:${changeColor(
          r.delta!.scoreDelta
        )};">${fmtDelta(r.delta!.scoreDelta)}</td>
      </tr>`
    )
    .join("");
}

function moverSection(label: string, rowsHtml: string): string {
  const body =
    rowsHtml === ""
      ? `<div style="font-size:13px;color:${MUTED};">None.</div>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml}</table>`;
  return section({ label, body });
}

function watchlistTable(rows: DigestRow[]): string {
  const th =
    "text-align:right;padding:0 0 7px 8px;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:" +
    FAINT +
    ";";
  const body = rows
    .map(
      (r, i) => `
      <tr style="background:${i % 2 ? "#ffffff" : "#f6f8fa"};">
        <td style="padding:6px 8px 6px 0;font-size:13px;color:${INK};">${r.symbol}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;color:${INK};text-align:right;">${fmtCurrency(
          r.price
        )}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;text-align:right;color:${
          r.delta ? changeColor(r.delta.priceChangePercent) : MUTED
        };">${r.delta ? fmtPct(r.delta.priceChangePercent) : "—"}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;text-align:right;color:${
          r.delta ? changeColor(r.delta.scoreDelta) : MUTED
        };">${r.delta ? fmtDelta(r.delta.scoreDelta) : "—"}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;text-align:right;color:${
          r.delta ? changeColor(r.delta.rsiDelta) : MUTED
        };">${r.delta ? fmtDelta(r.delta.rsiDelta) : "—"}</td>
      </tr>`
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid ${HAIRLINE};">
          <th style="text-align:left;padding:0 8px 7px 0;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${FAINT};">Symbol</th>
          <th style="${th}">Price</th>
          <th style="${th}">Price Δ</th>
          <th style="${th}">Score Δ</th>
          <th style="${th}">RSI Δ</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderHtml(result: DigestResult, weekStart: Snapshot | null): string {
  const parts = [h1("📊 weekly recap")];

  parts.push(
    section({
      label: "Market",
      body: `
        ${benchmarkTable(result.marketBriefing.benchmarks)}
        <div style="margin-top:10px;font-size:13px;color:${BODY};line-height:1.55;">${result.marketBriefing.summary}</div>
        <div style="margin-top:12px;">${gaugeBadge(result.marketSentiment)}</div>`,
    })
  );

  if (!weekStart) {
    parts.push(
      section({
        label: "This week's movers",
        body: `<div style="font-size:13px;color:${MUTED};">Not enough history yet for a weekly comparison — this becomes a real week-over-week read starting next Friday.</div>`,
      })
    );
  } else {
    const priceMovers = topMovers(result.rows, (r) => r.delta!.priceChangePercent);
    const scoreMovers = topMovers(result.rows, (r) => r.delta!.scoreDelta);
    parts.push(moverSection("Price gainers this week", priceMoverRows(priceMovers.gainers)));
    parts.push(moverSection("Price losers this week", priceMoverRows(priceMovers.losers)));
    parts.push(moverSection("Score improved this week", scoreMoverRows(scoreMovers.gainers)));
    parts.push(moverSection("Score declined this week", scoreMoverRows(scoreMovers.losers)));
    parts.push(
      section({
        label: `Full watchlist · ${result.rows.length}`,
        body: watchlistTable(result.rows),
        note: "Δ columns are the change vs. Monday's scan.",
      })
    );
  }

  if (result.skipped.length > 0) {
    parts.push(section({ label: "Not scored · data gaps", body: skippedList(result.skipped) }));
  }

  return page(parts.join(""));
}

function renderText(result: DigestResult, weekStart: Snapshot | null): string {
  const lines: string[] = ["📊 weekly recap", ""];

  lines.push("MARKET");
  for (const b of result.marketBriefing.benchmarks) {
    lines.push(`  ${b.label}: ${fmtCurrency(b.price)} (${fmtPct(b.changePercent)})`);
  }
  lines.push(`  ${result.marketBriefing.summary}`);
  lines.push(`  Sentiment: ${result.marketSentiment.label} — ${result.marketSentiment.summary}`);
  lines.push("");

  if (!weekStart) {
    lines.push(
      "Not enough history yet for a weekly comparison — this becomes a real week-over-week read starting next Friday."
    );
    lines.push("");
  } else {
    const priceMovers = topMovers(result.rows, (r) => r.delta!.priceChangePercent);
    const scoreMovers = topMovers(result.rows, (r) => r.delta!.scoreDelta);

    const moverLines = (rows: DigestRow[], fmt: (r: DigestRow) => string) => {
      if (rows.length === 0) {
        lines.push("  None.");
        return;
      }
      for (const r of rows) lines.push(`  ${r.symbol.padEnd(6)} ${fmt(r)}`);
    };

    lines.push("PRICE GAINERS THIS WEEK");
    moverLines(priceMovers.gainers, (r) => fmtPct(r.delta!.priceChangePercent));
    lines.push("");
    lines.push("PRICE LOSERS THIS WEEK");
    moverLines(priceMovers.losers, (r) => fmtPct(r.delta!.priceChangePercent));
    lines.push("");
    lines.push("SCORE IMPROVED THIS WEEK");
    moverLines(scoreMovers.gainers, (r) => `score ${r.score.toFixed(0)} (${fmtDelta(r.delta!.scoreDelta)})`);
    lines.push("");
    lines.push("SCORE DECLINED THIS WEEK");
    moverLines(scoreMovers.losers, (r) => `score ${r.score.toFixed(0)} (${fmtDelta(r.delta!.scoreDelta)})`);
    lines.push("");

    lines.push(`FULL WATCHLIST (${result.rows.length})`);
    for (const r of result.rows) {
      const priceDelta = r.delta ? fmtPct(r.delta.priceChangePercent) : "—";
      const scoreDelta = r.delta ? fmtDelta(r.delta.scoreDelta) : "—";
      const rsiDelta = r.delta ? fmtDelta(r.delta.rsiDelta) : "—";
      lines.push(
        `  ${r.symbol.padEnd(6)} ${fmtCurrency(r.price).padStart(9)}  price ${priceDelta.padStart(
          8
        )}  score ${scoreDelta.padStart(4)}  RSI ${rsiDelta.padStart(4)}`
      );
    }
    lines.push("");
  }

  if (result.skipped.length > 0) {
    lines.push("Not scored (data gaps):");
    lines.push(result.skipped.map((s) => `${s.symbol} (${s.reason})`).join(", "));
    lines.push("");
  }

  lines.push(
    "Deltas are vs. Monday's morning scan. Market sentiment is a deterministic breadth/RSI/benchmark gauge, not a third-party index. NFA."
  );

  return lines.join("\n");
}
