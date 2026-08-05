import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCashflowProjectionValues,
  type CashflowReportRow,
  type CashflowValues,
} from "./cashflow.ts";

function row(key: string, actual: Record<string, number>, budget: Record<string, number>) {
  return {
    key,
    label: key,
    section: "Test",
    level: 0,
    kind: "result",
    values: { actual, budget } satisfies CashflowValues,
  } satisfies CashflowReportRow;
}

test("bank projection carries the closing actual balance into the first budget month", () => {
  const months = ["2026-06", "2026-07"];
  const projection = buildCashflowProjectionValues(
    [
      row(
        "opening-cash-balance",
        { "2026-06": -9_557.26, "2026-07": -20_027.81 },
        { "2026-06": -117_575.67, "2026-07": -150_535.67 },
      ),
      row(
        "net-cashflow",
        { "2026-06": -10_470.55, "2026-07": -16_558.27 },
        { "2026-06": -32_960, "2026-07": -16_558.27 },
      ),
      row(
        "closing-cash-balance",
        { "2026-06": -20_027.81, "2026-07": -36_586.08 },
        { "2026-06": -150_535.67, "2026-07": -167_093.94 },
      ),
    ],
    months,
    "2026-06",
  );

  assert.ok(Math.abs(projection["opening-cash-balance"]["2026-07"] - -20_027.81) < 0.005);
  assert.ok(Math.abs(projection["closing-cash-balance"]["2026-07"] - -36_586.08) < 0.005);
});

test("bank projection preserves an intentional reset within the same metric", () => {
  const months = ["2026-06", "2026-07", "2026-08"];
  const projection = buildCashflowProjectionValues(
    [
      row(
        "opening-cash-balance",
        { "2026-06": 100, "2026-07": 80, "2026-08": 80 },
        { "2026-06": -60, "2026-07": -50, "2026-08": 200 },
      ),
      row(
        "net-cashflow",
        { "2026-06": -20, "2026-07": 10, "2026-08": 5 },
        { "2026-06": 10, "2026-07": 10, "2026-08": 5 },
      ),
      row(
        "closing-cash-balance",
        { "2026-06": 80, "2026-07": 90, "2026-08": 85 },
        { "2026-06": -50, "2026-07": -40, "2026-08": 205 },
      ),
    ],
    months,
    "2026-06",
  );

  assert.equal(projection["opening-cash-balance"]["2026-07"], 80);
  assert.equal(projection["closing-cash-balance"]["2026-07"], 90);
  assert.equal(projection["opening-cash-balance"]["2026-08"], 200);
  assert.equal(projection["closing-cash-balance"]["2026-08"], 205);
});
