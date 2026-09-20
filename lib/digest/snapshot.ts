import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DigestResult } from "./types";

export interface SnapshotEntry {
  score: number;
  rsi: number;
  price: number;
}

export interface Snapshot {
  scannedAt: string;
  bySymbol: Record<string, SnapshotEntry>;
}

export const SNAPSHOT_PATH = "data/last-scan.json";

// Captured once, from the Monday morning run, and left untouched the rest of
// the week — the weekly recap diffs Friday's scan against this to get a
// week-over-week delta instead of the daily one in SNAPSHOT_PATH.
export const WEEK_START_SNAPSHOT_PATH = "data/week-start-scan.json";

// Missing or corrupt is just "no prior data" — a symbol new to the
// watchlist hits this same path, so day-over-day deltas degrade to null
// rather than failing the run.
export function loadSnapshot(path: string = SNAPSHOT_PATH): Snapshot | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  } catch {
    return null;
  }
}

export function buildSnapshot(result: DigestResult): Snapshot {
  const bySymbol: Record<string, SnapshotEntry> = {};
  for (const row of result.rows) {
    bySymbol[row.symbol] = { score: row.score, rsi: row.rsi, price: row.price };
  }
  return { scannedAt: result.scannedAt, bySymbol };
}

export function saveSnapshot(snapshot: Snapshot, path: string = SNAPSHOT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
}
