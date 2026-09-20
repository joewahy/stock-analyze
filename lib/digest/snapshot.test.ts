import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnapshot, loadSnapshot, saveSnapshot } from "./snapshot";
import type { DigestResult } from "./types";

function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "digest-snapshot-"));
  return join(dir, "nested", "last-scan.json");
}

test("loadSnapshot returns null when the file doesn't exist", () => {
  assert.equal(loadSnapshot(tempPath()), null);
});

test("loadSnapshot returns null for corrupt JSON instead of throwing", () => {
  const path = tempPath();
  saveSnapshot({ scannedAt: "2024-01-01T00:00:00.000Z", bySymbol: {} }, path);
  writeFileSync(path, "{not json");
  assert.equal(loadSnapshot(path), null);
  rmSync(join(path, "..", ".."), { recursive: true, force: true });
});

test("saveSnapshot then loadSnapshot round-trips, creating parent directories", () => {
  const path = tempPath();
  const snapshot = {
    scannedAt: "2024-01-02T12:00:00.000Z",
    bySymbol: { AAPL: { score: 61, rsi: 42, price: 190.5 } },
  };
  saveSnapshot(snapshot, path);
  assert.deepEqual(loadSnapshot(path), snapshot);
  rmSync(join(path, "..", ".."), { recursive: true, force: true });
});

test("buildSnapshot pulls score/rsi/price per symbol from the scan result", () => {
  const result = {
    scannedAt: "2024-01-03T12:00:00.000Z",
    rows: [
      { symbol: "AAPL", score: 70, rsi: 35, price: 200 },
      { symbol: "MSFT", score: 55, rsi: 60, price: 400 },
    ],
  } as unknown as DigestResult;

  assert.deepEqual(buildSnapshot(result), {
    scannedAt: "2024-01-03T12:00:00.000Z",
    bySymbol: {
      AAPL: { score: 70, rsi: 35, price: 200 },
      MSFT: { score: 55, rsi: 60, price: 400 },
    },
  });
});
