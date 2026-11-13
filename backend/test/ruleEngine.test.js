import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../src/engine/ruleEngine.js";
test("passes threshold and expression rules", () => {
  const r = evaluateRules(
    [
      {
        id: "score",
        type: "threshold",
        field: "score",
        operator: ">=",
        value: 600,
        onFail: "REJECT",
      },
      {
        id: "ratio",
        type: "expression",
        expression: "amount <= income * 5",
        onFail: "MANUAL_REVIEW",
      },
    ],
    { score: 700, amount: 100000, income: 50000 },
  );
  assert.equal(r.outcome, "APPROVE");
  assert.equal(
    r.trace.every((x) => x.passed),
    true,
  );
});
test("rejects when a rejection rule fails", () => {
  const r = evaluateRules(
    [
      {
        id: "score",
        type: "threshold",
        field: "score",
        operator: ">=",
        value: 600,
        onFail: "REJECT",
      },
    ],
    { score: 400 },
  );
  assert.equal(r.outcome, "REJECT");
});
test("manual review is lower priority than rejection", () => {
  const r = evaluateRules(
    [
      {
        id: "a",
        type: "threshold",
        field: "x",
        operator: ">",
        value: 1,
        onFail: "MANUAL_REVIEW",
      },
      {
        id: "b",
        type: "threshold",
        field: "y",
        operator: ">",
        value: 1,
        onFail: "REJECT",
      },
    ],
    { x: 0, y: 0 },
  );
  assert.equal(r.outcome, "REJECT");
});
