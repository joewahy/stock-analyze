import { runDailyScan } from "@/lib/digest/scan";
import { runMiddayScan } from "@/lib/digest/midday";
import { renderDigestEmail } from "@/lib/email/digestEmail";
import { renderMiddayEmail } from "@/lib/email/middayEmail";
import { sendDigestEmail } from "@/lib/email/gmail";
import { escapeHtml } from "@/lib/email/emailTheme";

type Mode = "daily" | "midday";

interface Options {
  mode: Mode;
  dryRun: boolean;
  mock: boolean;
  expectHour: number | null;
  schedule: string | null;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    mode: "daily",
    dryRun: false,
    mock: false,
    expectHour: null,
    schedule: null,
  };
  for (const arg of argv) {
    if (arg === "--midday" || arg === "--mode=midday") opts.mode = "midday";
    else if (arg === "--mode=daily") opts.mode = "daily";
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--mock") opts.mock = true;
    else if (arg.startsWith("--expect-hour=")) {
      opts.expectHour = Number(arg.slice("--expect-hour=".length));
    } else if (arg.startsWith("--schedule=")) {
      opts.schedule = arg.slice("--schedule=".length).trim() || null;
    }
  }
  return opts;
}

// GitHub Actions cron has no timezone support, so each scheduled job fires at
// both the EST and EDT UTC equivalents of the target Eastern time. This guard
// lets only the run whose cron maps to the intended Eastern hour proceed; the
// other exits as a no-op. Scheduled runs are often started hours late, so the
// guard checks the cron's UTC hour (--schedule) rather than the current clock.
// Without --schedule it falls back to the current time.
function easternHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(at)
  );
}

function scheduledTime(cron: string): Date {
  const [minute, hour] = cron.split(/\s+/).map(Number);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) {
    throw new Error(`Unsupported cron for --schedule: "${cron}"`);
  }
  const at = new Date();
  at.setUTCHours(hour, minute, 0, 0);
  return at;
}

async function main(): Promise<void> {
  const { mode, dryRun, mock, expectHour, schedule } = parseArgs(
    process.argv.slice(2)
  );

  if (mock) {
    const { installMockFetch } = await import("@/lib/providers/mockFetch");
    installMockFetch();
  }

  if (expectHour !== null) {
    const hour = easternHour(schedule ? scheduledTime(schedule) : new Date());
    if (hour !== expectHour) {
      console.log(
        `Eastern hour is ${hour}, expected ${expectHour} — skipping this run.`
      );
      return;
    }
  }

  // --mock is for exercising the pipeline with fixture data, never for
  // sending mail with it, so it always implies --dry-run.
  const effectiveDryRun = dryRun || mock;

  console.log(
    `Running ${mode} digest${effectiveDryRun ? " (dry run)" : ""}${mock ? " (mock data)" : ""}...`
  );

  try {
    const email =
      mode === "midday"
        ? renderMiddayEmail(await runMiddayScan())
        : renderDigestEmail(await runDailyScan());

    if (effectiveDryRun) {
      console.log(email.subject);
      console.log("\n" + email.text);
      return;
    }

    await sendDigestEmail(email);
    console.log(`Sent: ${email.subject}`);
  } catch (err) {
    if (!effectiveDryRun) await notifyFailure(mode, err);
    throw err;
  }
}

// Best-effort: a run that throws otherwise fails silently from the user's
// perspective (visible only in the Actions log), which defeats the point of
// a digest *emailer*. A failure here must never mask the original error or
// change the process's exit code.
async function notifyFailure(mode: Mode, err: unknown): Promise<void> {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  try {
    await sendDigestEmail({
      subject: `Stock digest failed (${mode})`,
      text: message,
      html: `<pre>${escapeHtml(message)}</pre>`,
    });
    console.error("Sent failure notification email.");
  } catch (notifyErr) {
    console.error(
      "Also failed to send failure notification email:",
      notifyErr instanceof Error ? notifyErr.message : notifyErr
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
