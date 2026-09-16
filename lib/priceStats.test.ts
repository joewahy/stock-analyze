import { test } from "node:test";
import assert from "node:assert/strict";
import { fiftyTwoWeekRange } from "@/lib/priceStats";
import { pricesFromCloses } from "@/lib/testHelpers";

test("fiftyTwoWeekRange returns null without history", () => {
  assert.equal(fiftyTwoWeekRange(null), null);
  assert.equal(fiftyTwoWeekRange([]), null);
});

test("fiftyTwoWeekRange only looks at the last 252 sessions", () => {
  const old = [1, 1000, 1, 1000];
  const recent = Array.from({ length: 252 }, (_, i) => 50 + (i % 10));
  const history = pricesFromCloses([...old, ...recent]).reverse();
  assert.deepEqual(fiftyTwoWeekRange(history), { low: 50, high: 59 });
});
