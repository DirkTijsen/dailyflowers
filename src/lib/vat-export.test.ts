import assert from "node:assert/strict";
import test from "node:test";
import { recentPeriods, vatBreakdownKey } from "./vat-export.ts";

test("recentPeriods does not repeat July when the reference date is July 31", () => {
  const periods = recentPeriods(new Date(2026, 6, 31, 12), 4);

  assert.deepEqual(periods, ["2026-07", "2026-06", "2026-05", "2026-04"]);
  assert.equal(new Set(periods).size, periods.length);
});

test("vatBreakdownKey treats PostgreSQL numeric strings and numbers equally", () => {
  assert.equal(
    vatBreakdownKey("2026-07", "shopify_webshop", "21.00"),
    vatBreakdownKey("2026-07", "shopify_webshop", 21),
  );
  assert.equal(
    vatBreakdownKey("2026-07", "shopify_webshop", "9.00"),
    vatBreakdownKey("2026-07", "shopify_webshop", 9),
  );
});
