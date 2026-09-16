import assert from "node:assert/strict";
import type { HistoricalPricePoint } from "@/lib/providers/types";

// Daily price history from a list of closes, one calendar day apart starting
// 2024-01-01. open/high/low all equal the close so 52-week ranges are easy
// to reason about in tests.
export function pricesFromCloses(closes: number[]): HistoricalPricePoint[] {
  const start = Date.UTC(2024, 0, 1);
  return closes.map((close, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  }));
}

export function assertClose(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}
