import type { DigestResult, DigestRow, UpcomingEvent } from "@/lib/digest/types";
import { clamp } from "@/lib/util";
import {
  ACCENT,
  BODY,
  changeColor,
  DOWN,
  escapeHtml,
  FAINT,
  fmtCurrency,
  fmtDelta,
  fmtPct,
  h1,
  HAIRLINE,
  INK,
  MUTED,
  page,
  readsSection,
  section,
  UP,
} from "./emailTheme";
import { benchmarkTable, gaugeBadge, skippedList } from "./fragments";

// "in 2 days (Tue, Sep 9)" style label for a calendar event.
function eventTiming(e: UpcomingEvent): string {
  const dow = new Date(`${e.date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const rel =
    e.daysUntil <= 0 ? "today" : e.daysUntil === 1 ? "tomorrow" : `in ${e.daysUntil} days`;
  return `${rel} (${dow})`;
}

// "Oversold" / "Overbought" / "" for a row — shared with the plain-text
// renderer (lib/email/digestText.ts).
export function flagFor(row: DigestRow): string {
  if (row.oversold) return "Oversold";
  if (row.overbought) return "Overbought";
  return "";
}

function flagChip(row: DigestRow): string {
  const label = flagFor(row);
  if (!label) return "";
  const [bg, fg] = row.overbought ? ["#f6eceb", DOWN] : ["#eef1f4", ACCENT];
  return `<span style="display:inline-block;background:${bg};color:${fg};border-radius:4px;padding:1px 7px;font-size:11px;font-weight:600;">${label}</span>`;
}

// "(+8)" in green / "(-8)" in red / "(0)" in faint gray — change vs. the
// previous morning snapshot, shown next to RSI and score.
function deltaSpan(n: number): string {
  const rounded = Math.round(n);
  const color = rounded === 0 ? FAINT : changeColor(rounded);
  return `<span style="color:${color};font-size:11px;">(${fmtDelta(n)})</span>`;
}

export function renderDigestHtml(result: DigestResult): string {
  return page(
    [
      h1("🌅 morning"),
      briefingSection(result),
      sentimentSection(result),
      eventsSection(result),
      standoutsSection(result),
      readsSection(result.newsHighlights),
      watchlistSection(result),
      skippedSection(result),
    ].join("")
  );
}

function briefingSection(result: DigestResult): string {
  return section({
    label: "Market briefing",
    body: `
      ${benchmarkTable(result.marketBriefing.benchmarks)}
      <div style="margin-top:10px;font-size:13px;color:${BODY};line-height:1.55;">${result.marketBriefing.summary}</div>`,
  });
}

function sentimentSection(result: DigestResult): string {
  return section({
    label: "Market sentiment",
    body: gaugeBadge(result.marketSentiment),
  });
}

function eventsSection(result: DigestResult): string {
  if (result.upcomingEvents.length === 0) {
    return section({
      label: "Upcoming events · next 14 days",
      body: `<div style="font-size:13px;color:${MUTED};">No watchlist earnings scheduled in the next 14 days.</div>`,
    });
  }

  const rows = result.upcomingEvents
    .map((e) => {
      const imminent = e.daysUntil <= 1;
      const dot = imminent
        ? `<span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${ACCENT};margin-right:7px;vertical-align:middle;"></span>`
        : "";
      const est =
        typeof e.epsEstimate === "number" && Number.isFinite(e.epsEstimate)
          ? `est. EPS $${e.epsEstimate.toFixed(2)}`
          : "";
      return `
      <tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:${INK};font-weight:700;white-space:nowrap;">${dot}${
          e.symbol
        }</td>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:${MUTED};">${escapeHtml(e.name)}</td>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:${INK};font-weight:${
          imminent ? "700" : "400"
        };white-space:nowrap;">${eventTiming(e)}${e.when ? `, ${e.when}` : ""}</td>
        <td style="padding:6px 0;font-size:12px;color:${FAINT};white-space:nowrap;">${est}</td>
      </tr>`;
    })
    .join("");

  return section({
    label: "Upcoming events · next 14 days",
    body: `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">${rows}</table>`,
    note: `${result.upcomingEvents.length} watchlist ${
      result.upcomingEvents.length === 1 ? "company reports" : "companies report"
    } earnings in this window. Dates from Finnhub's calendar and can shift.`,
  });
}

function standoutsSection(result: DigestResult): string {
  if (result.standouts.length === 0) {
    return section({
      label: "Standouts",
      body: `<div style="font-size:13px;color:${MUTED};">No standouts today.</div>`,
    });
  }

  const cards = result.standouts
    .map((c) => {
      const borderColor = c.allFactorsStrong ? ACCENT : HAIRLINE;
      const badge = c.allFactorsStrong
        ? `<span style="display:inline-block;margin-left:8px;background:${ACCENT};color:#ffffff;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;letter-spacing:.03em;vertical-align:middle;">★ STRONG</span>`
        : "";
      const score = clamp(c.score, 0, 100);
      const business = c.businessSummary
        ? `<div style="font-size:13px;color:${BODY};line-height:1.55;margin-bottom:8px;"><span style="color:${INK};font-weight:600;">What they do:</span> ${escapeHtml(
            c.businessSummary
          )}</div>`
        : "";
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-bottom:10px;">
        <tr><td style="background:#ffffff;border:1px solid ${borderColor};border-radius:12px;padding:15px 16px;">
          <div style="font-size:15px;font-weight:700;color:${INK};">
            ${c.symbol}<span style="font-weight:400;color:${MUTED};"> — ${escapeHtml(c.name)}</span>${badge}
          </div>
          <div style="margin:6px 0 8px;font-size:13px;color:${INK};">
            <b>${fmtCurrency(c.price)}</b>
            &nbsp;<span style="color:${changeColor(c.changePercent)};font-weight:600;">${fmtPct(
              c.changePercent
            )}</span>
            &nbsp;·&nbsp; RSI ${c.rsi.toFixed(0)}${c.delta ? ` ${deltaSpan(c.delta.rsiDelta)}` : ""}
            &nbsp;·&nbsp; score ${c.score.toFixed(0)}${
              c.delta ? ` ${deltaSpan(c.delta.scoreDelta)}` : ""
            }
            ${flagChip(c) ? `&nbsp; ${flagChip(c)}` : ""}
          </div>
          <div style="height:4px;background:#e7ebef;border-radius:999px;overflow:hidden;margin-bottom:10px;">
            <div style="height:4px;width:${score.toFixed(0)}%;background:${ACCENT};"></div>
          </div>
          <div style="font-size:13px;color:${BODY};line-height:1.55;margin-bottom:8px;">${escapeHtml(
            c.thesis
          )}</div>
          ${business}
          <div style="font-size:13px;color:${BODY};line-height:1.55;margin-bottom:12px;"><span style="font-weight:600;color:${INK};">Worth watching:</span> ${escapeHtml(
            c.caution
          )}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
            <tr>
              <td style="padding-right:8px;">
                <div style="background:#edf4ef;border-radius:8px;padding:7px 12px;">
                  <div style="font-size:10px;color:${MUTED};text-transform:uppercase;letter-spacing:.05em;">Target · ${
                    c.horizonDays
                  }d</div>
                  <div style="font-size:14px;font-weight:700;color:${UP};">${fmtCurrency(
                    c.targetPrice
                  )}</div>
                </div>
              </td>
              <td>
                <div style="background:#f7edec;border-radius:8px;padding:7px 12px;">
                  <div style="font-size:10px;color:${MUTED};text-transform:uppercase;letter-spacing:.05em;">Stop-loss</div>
                  <div style="font-size:14px;font-weight:700;color:${DOWN};">${fmtCurrency(
                    c.stopLoss
                  )}</div>
                </div>
              </td>
            </tr>
          </table>
          <div style="margin-top:10px;font-size:11px;color:${FAINT};">
            Valuation ${c.grades.valuation.toFixed(0)} · Growth ${c.grades.growth.toFixed(
              0
            )} · Profitability ${c.grades.profitability.toFixed(0)} · Momentum ${c.grades.momentum.toFixed(
              0
            )} · EPS&nbsp;&amp;&nbsp;Revenue ${c.grades.epsRevenue.toFixed(0)}
          </div>
        </td></tr>
      </table>`;
    })
    .join("");

  return section({
    label: `Standouts · ${result.standouts.length}`,
    body: cards,
    note: "Ranked by a blended oversold + proximity-to-low + fundamentals score. ★ STRONG = strong on all three factors individually. Target/stop are a 30-day ±1σ band from historical volatility. (±N) is the change vs. the previous morning digest.",
  });
}

function watchlistSection(result: DigestResult): string {
  const standoutSymbols = new Set(result.standouts.map((r) => r.symbol));
  const th =
    "text-align:right;padding:0 0 7px 8px;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:" +
    FAINT +
    ";";
  const rows = result.rows
    .map((r, i) => {
      const flag = flagFor(r);
      const star = standoutSymbols.has(r.symbol)
        ? `<span style="color:${ACCENT};">★</span> `
        : "";
      return `<tr style="background:${i % 2 ? "#ffffff" : "#f6f8fa"};">
        <td style="padding:6px 8px 6px 0;font-size:13px;color:${INK};">${star}${r.symbol}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;color:${INK};text-align:right;">${fmtCurrency(
          r.price
        )}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;text-align:right;color:${changeColor(
          r.changePercent
        )};">${fmtPct(r.changePercent)}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;color:${INK};text-align:right;">${r.rsi.toFixed(
          0
        )}</td>
        <td style="padding:6px 0 6px 8px;font-size:13px;color:${INK};text-align:right;">${r.score.toFixed(
          0
        )}${r.delta ? ` ${deltaSpan(r.delta.scoreDelta)}` : ""}</td>
        <td style="padding:6px 0 6px 10px;font-size:11px;color:${MUTED};text-align:right;white-space:nowrap;">${flag}</td>
      </tr>`;
    })
    .join("");

  return section({
    label: `Full watchlist · ${result.rows.length}`,
    body: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid ${HAIRLINE};">
            <th style="text-align:left;padding:0 8px 7px 0;font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${FAINT};">Symbol</th>
            <th style="${th}">Price</th>
            <th style="${th}">Chg</th>
            <th style="${th}">RSI</th>
            <th style="${th}">Score</th>
            <th style="${th}"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`,
  });
}

function skippedSection(result: DigestResult): string {
  if (result.skipped.length === 0) return "";
  return section({
    label: "Not scored · data gaps",
    body: skippedList(result.skipped),
  });
}
