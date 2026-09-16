import { runDailyScan } from "@/lib/digest/scan";
import { runMiddayScan } from "@/lib/digest/midday";
import { renderDigestEmail } from "@/lib/email/digestEmail";
import { renderMiddayEmail } from "@/lib/email/middayEmail";
import { sendDigestEmail } from "@/lib/email/gmail";

type Mode = "daily" | "midday";

interface Options {
  mode: Mode;
  dryRun: boolean;
  expectHour: number | null;
  schedule: string | null;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    mode: "daily",
    dryRun: false,
    expectHour: null,
    schedule: null,
  };
  for (const arg of argv) {
    if (arg === "--midday" || arg === "--mode=midday") opts.mode = "midday";
    else if (arg === "--mode=daily") opts.mode = "daily";
    else if (arg === "--dry-run") opts.dryRun = true;
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
  const { mode, dryRun, expectHour, schedule } = parseArgs(
    process.argv.slice(2)
  );

  if (expectHour !== null) {
    const hour = easternHour(schedule ? scheduledTime(schedule) : new Date());
    if (hour !== expectHour) {
      console.log(
        `Eastern hour is ${hour}, expected ${expectHour} — skipping this run.`
      );
      return;
    }
  }

  console.log(`Running ${mode} digest${dryRun ? " (dry run)" : ""}...`);

  const email =
    mode === "midday"
      ? renderMiddayEmail(await runMiddayScan())
      : renderDigestEmail(await runDailyScan());

  if (dryRun) {
    console.log(email.subject);
    console.log("\n" + email.text);
    return;
  }

  await sendDigestEmail(email);
  console.log(`Sent: ${email.subject}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
