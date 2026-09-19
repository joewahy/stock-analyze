# Stock Digest Mailer

A personal, single-user tool that emails you a daily stock digest: it scans a
curated watchlist every trading morning and just... sends it. No "clear the
bar" gate, no gatekeeping — you get the mail every day. There's also an
optional, lighter midday update that goes out during the session.

Not investment advice (obviously). Every target/stop in the mail is a
statistical 30-day ±1σ band from historical volatility, not a promise. Don't
sue me.

No website, no API, nothing fancy. It's one script
(`scripts/run-digest.ts`) that GitHub Actions runs on a cron.

## The morning digest

Goes out once per trading day. Four parts:

1. **Market briefing** — SPY/QQQ/DIA/IWM price + % change, with a one-line
   summary of which benchmark led/lagged.
2. **Market sentiment** — a deterministic Bullish/Neutral/Bearish gauge
   computed from watchlist breadth (% of symbols up today), average RSI, and
   benchmark performance. Not some third-party fear/greed index — see
   `computeMarketSentiment` in `lib/digest/market.ts` for the exact weights.
3. **Standouts** — the top 3-5 symbols by score (oversold + proximity to
   52-week low + fundamentals), each with a thesis, 30-day target/stop-loss,
   and grade breakdown.
4. **Full watchlist** — every scanned symbol as a compact row (price, change%,
   RSI, score, oversold/overbought flag), so nothing gets hidden just because
   it didn't stand out.

Code lives in `lib/digest/*`, `lib/email/*`, and `scripts/run-digest.ts`.

**Watchlist**: `lib/digest/watchlist.ts`, ~30 liquid large-caps. FMP's free
tier 402s historical prices for a chunk of large-caps (confirmed at time of
writing: AVGO, ORCL, CRM, HD, MCD, LLY, MA, CAT, PG, ABT, TMO, LIN, ACN, TXN,
QCOM, LOW, TJX, BKNG, IBM) — those are already excluded from the default list.
A gated symbol just gets silently skipped with a clear reason (data
unavailable, not a "didn't qualify" judgment) instead of breaking the scan,
so it's safe to mess around with the list.

## The midday update

`npm run digest:midday` sends a lighter intraday email: benchmark moves, an
intraday **pulse** (Bullish/Neutral/Bearish from watchlist breadth +
benchmark move — no RSI term, since RSI intraday is just yesterday's close
restated), and the day's top gainers/losers across the watchlist. It only
pulls live Finnhub quotes — no FMP fundamentals or history — so there are
deliberately **no RSI, scores, targets, or stop-losses**; those come from
end-of-day data that doesn't move through the session, and that's what the
morning digest is for. See `lib/digest/midday.ts` and
`lib/email/middayEmail.ts`.

## Previewing a digest without sending mail

```bash
npm run digest -- --dry-run
npm run digest:midday -- --dry-run
```

Runs the full scan and prints the rendered email (subject + text) to stdout
without sending anything. Good for tuning the watchlist or thresholds before
you trust the schedule to send real mail.

## Running the pipeline without calling Finnhub/FMP

```bash
npm run digest:mock
npm run digest:midday:mock
```

`--mock` (implies `--dry-run`) swaps `fetch` for `lib/providers/mockFetch.ts`,
which returns deterministic, symbol-seeded fake data instead of hitting the
network. No API keys needed. Handy for iterating on scoring, thesis text, or
email templates without burning free-tier request budget or waiting out 429s
— the numbers are fake, but every code path (scan, grading, projection,
rendering) actually runs.

## Tests

```bash
npm test
npm run typecheck
```

Unit tests cover the pure math (RSI, projection, 52-week range, the five
graders, the standout score, sentiment/pulse, thesis text), the provider
retry helper, and — via `mockFetch` — an end-to-end run of `runDailyScan`/
`runMiddayScan` with no network access. They use Node's built-in test runner
and make no real network calls. Test files sit next to the code they cover as
`*.test.ts`.

## How the numbers are computed

No database — every run fetches from two free-tier data providers, computes
grades/projections, and caches results in memory for the life of the process
(see `lib/cache.ts`).

- **[Finnhub](https://finnhub.io)** — quote, analyst recommendation trend,
  company news, earnings surprises
- **[Financial Modeling Prep (FMP)](https://financialmodelingprep.com)** —
  company profile, financial ratios, income statement history, historical
  daily prices

The grading methodology (all thresholds, weights, and formulas) lives in
[`lib/grading/thresholds.ts`](lib/grading/thresholds.ts) and the five category
scorers in `lib/grading/*.ts` — Valuation, Growth, Profitability, Momentum,
EPS & Revenue, each a 0-100 rating. Grades are absolute-threshold based, not
sector-relative, since free-tier data doesn't reliably expose sector peer sets.

**No analyst dollar price targets** — no reputable provider gives those away
for free, which is why the target/stop shown is a self-computed statistical
estimate (trend + volatility bands from historical prices) instead of a real
$ price target.

## Getting API keys (both free)

1. **Finnhub**: sign up at [finnhub.io/register](https://finnhub.io/register),
   grab your API key from the dashboard.
2. **Financial Modeling Prep**: sign up at
   [site.financialmodelingprep.com/register](https://site.financialmodelingprep.com/register),
   grab your API key from the dashboard.

Neither one asks for a credit card on the free tier.

## Local runs

```bash
npm install
cp .env.local.example .env.local
# then fill in the values in .env.local
npm run digest -- --dry-run
```

The `digest` scripts don't load `.env.local` on their own — pass it through
Node yourself when running locally:

```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/run-digest.ts --dry-run
```

Environment variables (all five are also the GitHub Actions secrets):

| Variable | What it is |
| --- | --- |
| `FINNHUB_API_KEY` | Finnhub free-tier key |
| `FMP_API_KEY` | Financial Modeling Prep free-tier key |
| `DIGEST_GMAIL_USER` | the Gmail address that sends the mail |
| `DIGEST_GMAIL_APP_PASSWORD` | 16-char Gmail App Password (a scoped, revocable credential, not your account password) |
| `DIGEST_RECIPIENT_EMAIL` | where the digest lands |

## Sending mail

Mail goes through the Gmail account it's addressed from, over Gmail's own SMTP
servers, instead of some third-party mailer. Sending as yourself means
SPF/DKIM/DMARC line up naturally with gmail.com — no domain to buy or verify,
and nothing for Gmail's spam filter to squint at as spoofed.

One-time Gmail setup:

1. **Enable 2-Step Verification** on the sending Google account, if it isn't
   on already (Google Account → Security).
2. **Create an App Password**: Google Account → Security → App passwords →
   generate one for "Mail". You get a 16-character code — that's
   `DIGEST_GMAIL_APP_PASSWORD`.

## Failure notifications

If a run throws (provider's down, API shape changed, whatever), you get a
best-effort "Stock digest failed (daily|midday)" email with the error and
stack trace instead of the failure just quietly sitting in the Actions log.
Only fires for real (non-dry-run) sends — dry runs and `--mock` just let the
exception hit the console like normal. If even the notification email fails
to send, that gets logged too, but it never swallows the original error or
changes the process's exit code. See `notifyFailure` in
`scripts/run-digest.ts`.

## Scheduling with GitHub Actions

Two workflows in [`.github/workflows/`](.github/workflows) run the script:
`digest-morning.yml` (7:00 a.m. ET) and `digest-midday.yml` (12:00 p.m. ET),
weekdays only.

1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions → New repository secret** —
   add all five variables from the table above.
3. That's it. The workflows are live as soon as they're on the default
   branch. They only run on their cron — no manual trigger. To test the
   wiring, do a local dry run (see "Local runs" above), or temporarily bolt a
   `workflow_dispatch:` trigger back onto the workflow.

**On the schedule times**: GitHub cron is UTC with no daylight-saving
awareness, so each workflow lists *two* cron entries — the UTC time for EDT
and the one for EST. `scripts/run-digest.ts` takes an `--expect-hour`
argument and no-ops unless the current Eastern hour matches, so only the
correct one of the pair actually sends. GitHub's scheduler can also fire a
few minutes late (sometimes more) under load; that's fine here, just don't
expect to-the-minute delivery.

## Notes / known limitations

- **No database** — every run re-fetches from the providers (through the
  in-memory cache, which only lives as long as the process). Fine for
  single-user use.
- **FMP field names**: FMP has renamed fields across API versions before.
  `lib/providers/fmp.ts` tries a few known aliases per metric
  (`pickNumber`/`pickString` helpers) so a minor rename doesn't silently break
  everything — but if a metric shows up as "N/A" for every stock, go check the
  raw FMP response for that endpoint and add the right field name to the
  alias list.
- **FMP `limit` cap** — the free tier caps `limit` at 5 for `/income-statement`
  (both annual and quarterly). The scan requests exactly 5; ask for more and
  you get a 402, not partial data.
