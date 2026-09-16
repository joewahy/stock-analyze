// fetch() with retries for transient failures: 429 (rate limited), 5xx, and
// network errors. Anything else (402 gated, 401, 404) comes straight back so
// the caller reports it as-is. Backoff doubles from baseDelayMs with jitter;
// a Retry-After header wins when present. Both are capped at maxDelayMs.
//
// `label` is what gets logged on a retry. Never log the URL itself: it
// carries the API key as a query param.
export interface RetryOptions {
  label?: string;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

// Retry-After is either delay-seconds or an HTTP date.
function retryAfterMs(header: string | null, maxDelayMs: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, options: RetryOptions = {}): Promise<Response> {
  const { label = "request", retries = 3, baseDelayMs = 1_000, maxDelayMs = 30_000 } = options;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = backoffMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(`${label}: network error, retrying in ${Math.round(delay)}ms (${attempt + 1}/${retries})`);
      await sleep(delay);
      continue;
    }

    if (!isRetryable(res.status) || attempt >= retries) return res;

    const delay =
      retryAfterMs(res.headers.get("retry-after"), maxDelayMs) ??
      backoffMs(attempt, baseDelayMs, maxDelayMs);
    console.warn(`${label}: ${res.status}, retrying in ${Math.round(delay)}ms (${attempt + 1}/${retries})`);
    await res.body?.cancel();
    await sleep(delay);
  }
}
