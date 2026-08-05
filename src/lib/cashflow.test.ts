import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCashNeedScenarioValues,
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

test("cash need rows reconcile to net cashflow including the AFS revenue commission", () => {
  const scenario = buildCashNeedScenarioValues({
    periods: ["2026-01"],
    openingCash: { "2026-01": 70_644 },
    closingCash: { "2026-01": 7_651.15 },
    netCashflow: { "2026-01": -62_992.85 },
    plannedFunding: { "2026-01": 0 },
  });

  assert.equal(scenario.monthlyBeforeFunding["2026-01"], -62_992.85);
  assert.ok(Math.abs(scenario.cumulativeBeforeFunding["2026-01"] - 7_651.15) < 0.005);
  assert.equal(scenario.fundingNeed["2026-01"], 0);
  assert.equal(scenario.cumulativeAfterFunding["2026-01"], 7_651.15);
  assert.equal(scenario.additionalNeed["2026-01"], 0);
});

test("cash need rows separate planned funding and honor an opening-balance reset", () => {
  const scenario = buildCashNeedScenarioValues({
    periods: ["2026-01", "2026-02", "2026-03"],
    openingCash: { "2026-01": 10, "2026-02": 70, "2026-03": 200 },
    closingCash: { "2026-01": 70, "2026-02": 50, "2026-03": 180 },
    netCashflow: { "2026-01": 60, "2026-02": -20, "2026-03": -20 },
    plannedFunding: { "2026-01": 100, "2026-02": 0, "2026-03": 0 },
  });

  assert.equal(scenario.monthlyBeforeFunding["2026-01"], -40);
  assert.equal(scenario.cumulativeBeforeFunding["2026-01"], -30);
  assert.equal(scenario.fundingNeed["2026-01"], 30);
  assert.equal(scenario.cumulativeAfterFunding["2026-01"], 70);
  assert.equal(scenario.cumulativeBeforeFunding["2026-02"], -50);
  assert.equal(scenario.fundingNeed["2026-02"], 50);
  assert.equal(scenario.cumulativeBeforeFunding["2026-03"], 180);
  assert.equal(scenario.cumulativeAfterFunding["2026-03"], 180);
});
