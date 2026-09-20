// Shared visual system for the digest emails.
//
// Constraints that shape everything here: many clients strip <style>/<link>
// and web fonts (Gmail especially), so every rule is inline, there are no
// images, and the font is a stack that degrades to the OS UI sans. Light
// theme only. The daily email is long, so each section gets a faint color
// wash plus an accent rule on the left to stay scannable.

import type { NewsHighlight } from "@/lib/digest/types";

// "Google Sans" isn't licensed for third-party embedding, so this targets
// Roboto — Google's open UI typeface, the same shapes — and falls back to
// the platform UI sans (SF on Apple, Segoe on Windows) everywhere it can't
// load. The <link> below only lands in clients that keep <head> (Apple
// Mail, iOS); elsewhere the fallback is what renders, which is fine.
export const FONT =
  "'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";
const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap">';

// What every email renderer returns and `sendDigestEmail` consumes.
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// Signed whole-number delta, e.g. score/RSI vs. the prior snapshot.
export function fmtDelta(n: number): string {
  const rounded = Math.round(n);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Neutral ramp + gain/loss colors, shared so the two emails stay in sync.
export const INK = "#1f2328";
export const BODY = "#464c54";
export const MUTED = "#6b727b";
export const FAINT = "#949aa2";
export const HAIRLINE = "#e4e7eb";
export const UP = "#1f7a54";
export const DOWN = "#c0392b";
export const FLAT = "#57606a";

export function changeColor(n: number): string {
  if (n > 0) return UP;
  if (n < 0) return DOWN;
  return FLAT;
}

// One accent color for every section label and link — a plain link blue.
// Gain/loss color still shows up, but only on the numbers (changeColor).
export const ACCENT = "#1a56db";

// Flat section: a thin rule, an accent label, the caller's body, and an
// optional small footnote. No box, no background wash, no left bar.
export function section(opts: {
  label: string;
  body: string;
  note?: string;
}): string {
  const note = opts.note
    ? `<div style="margin-top:12px;font-size:11px;color:${FAINT};line-height:1.55;">${opts.note}</div>`
    : "";
  return `
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${HAIRLINE};">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${ACCENT};margin-bottom:12px;">${opts.label}</div>
    ${opts.body}
    ${note}
  </div>`;
}

// Outer shell: full document (so the font <link> has somewhere to live),
// pale gray page, one centered white "sheet" the content sits on.
export function page(inner: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${FONT_LINK}
</head>
<body style="margin:0;padding:0;background:#f2f3f5;font-family:${FONT};">
  <div style="max-width:640px;margin:0 auto;padding:24px 12px 36px;">
    <div style="background:#ffffff;border:1px solid ${HAIRLINE};border-radius:12px;padding:28px 24px;font-family:${FONT};color:${INK};font-size:14px;line-height:1.5;">
      ${inner}
    </div>
  </div>
</body>
</html>`;
}

export function h1(text: string): string {
  return `<h1 style="font-size:22px;font-weight:700;margin:0 0 18px;letter-spacing:-.01em;">${text}</h1>`;
}

export function footnote(text: string): string {
  return `<div style="margin-top:22px;padding-top:14px;border-top:1px solid ${HAIRLINE};font-size:11px;color:${FAINT};line-height:1.6;">${text}</div>`;
}

// Rough "3h ago" / "2d ago" from a unix-seconds timestamp.
export function relativeTime(unixSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diffSec < 3600) return `${Math.max(1, Math.round(diffSec / 60))}m ago`;
  if (diffSec < 86_400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86_400)}d ago`;
}

// "Interesting reads" — shared by both emails so the card style stays
// identical. Pass an empty list for the empty-state block.
export function readsSection(
  highlights: NewsHighlight[],
  opts: { note?: string } = {}
): string {
  if (highlights.length === 0) {
    return section({
      label: "Interesting reads",
      body: `<div style="font-size:13px;color:${MUTED};">No notable headlines surfaced today.</div>`,
    });
  }

  const cards = highlights
    .map(
      (n) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-bottom:8px;">
        <tr><td style="background:#ffffff;border:1px solid ${HAIRLINE};border-radius:12px;padding:13px 15px;">
          <a href="${escapeHtml(
            n.url
          )}" style="font-size:14px;font-weight:600;color:${ACCENT};text-decoration:none;line-height:1.4;">${escapeHtml(
            n.headline
          )}</a>
          <div style="margin:5px 0 ${n.summary ? "7px" : "0"};font-size:11px;color:${FAINT};">
            <span style="background:#e9edf1;color:${MUTED};border-radius:4px;padding:1px 6px;">${escapeHtml(
              n.category
            )}</span>
            &nbsp;${escapeHtml(n.source)} &nbsp;·&nbsp; ${relativeTime(n.datetime)}
          </div>
          ${
            n.summary
              ? `<div style="font-size:13px;color:${BODY};line-height:1.55;">${escapeHtml(
                  n.summary
                )}</div>`
              : ""
          }
        </td></tr>
      </table>`
    )
    .join("");

  return section({
    label: "Interesting reads",
    body: cards,
    note:
      opts.note ??
      "Third-party headlines, ranked by recency and keyword signal — not endorsements.",
  });
}
