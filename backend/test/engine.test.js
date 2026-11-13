import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../src/engine/ruleEngine.js";
import { runWorkflow } from "../src/engine/workflowEngine.js";
const base = {
  id: "test-workflow",
  version: 1,
  requiredFields: ["name", "score"],
  rules: [
    {
      id: "score-min",
      type: "threshold",
      field: "score",
      operator: ">=",
      value: 600,
      onFail: "REJECT",
      message: "Score too low",
    },
  ],
};
function record(input) {
  return { input: structuredClone(input), audit: [], retryCount: 0 };
}
test("rule engine passes threshold and produces trace", () => {
  const r = evaluateRules(base.rules, { score: 700 });
  assert.equal(r.outcome, "APPROVE");
  assert.equal(r.trace[0].passed, true);
});
test("rule engine rejects failed mandatory threshold", () => {
  const r = evaluateRules(base.rules, { score: 500 });
  assert.equal(r.outcome, "REJECT");
  assert.equal(r.trace[0].message, "Score too low");
});
test("rule engine supports safe arithmetic expression", () => {
  const r = evaluateRules(
    [
      {
        id: "ratio",
        type: "expression",
        expression: "amount <= income * 5",
        onFail: "MANUAL_REVIEW",
      },
    ],
    { amount: 400, income: 100 },
  );
  assert.equal(r.outcome, "APPROVE");
});
test("unsupported expressions fail closed", () => {
  assert.throws(() =>
    evaluateRules(
      [{ id: "bad", type: "expression", expression: "process.exit()" }],
      {},
    ),
  );
});
test("missing required input is rejected and audited", async () => {
  const x = record({ name: "" });
  await runWorkflow(x, base);
  assert.equal(x.status, "REJECTED");
  assert.ok(
    x.audit.some((a) => a.stage === "VALIDATE" && a.action === "FAILED"),
  );
});
test("happy path approves and records decision trail", async () => {
  const x = record({ name: "A", score: 700 });
  await runWorkflow(x, base);
  assert.equal(x.status, "APPROVED");
  assert.ok(
    x.audit.some(
      (a) => a.stage === "EXTERNAL_VERIFICATION" && a.action === "PASSED",
    ),
  );
});
test("transient dependency failure can be retried", async () => {
  const x = record({ name: "A", score: 700 });
  await runWorkflow(x, base, {
    dependency: async () => ({ ok: false, message: "timeout" }),
    maxRetries: 3,
  });
  assert.equal(x.status, "RETRY_PENDING");
  assert.equal(x.retryCount, 1);
});
test("retry limit routes to manual review", async () => {
  const x = record({ name: "A", score: 700 });
  await runWorkflow(x, base, {
    dependency: async () => ({ ok: false, message: "timeout" }),
    maxRetries: 1,
  });
  assert.equal(x.status, "MANUAL_REVIEW");
  assert.equal(x.decision, "MANUAL_REVIEW");
});
test("permanent dependency failure does not retry forever", async () => {
  const x = record({ name: "A", score: 700 });
  await runWorkflow(x, base, {
    dependency: async () => ({
      ok: false,
      transient: false,
      message: "invalid response",
    }),
  });
  assert.equal(x.status, "MANUAL_REVIEW");
  assert.equal(x.retryCount, 1);
});
test("manual-review rule overrides approval but not rejection", async () => {
  const x = record({ name: "A", score: 700 });
  const cfg = {
    ...base,
    rules: [
      ...base.rules,
      {
        id: "large",
        type: "threshold",
        field: "amount",
        operator: "<=",
        value: 10,
        onFail: "MANUAL_REVIEW",
      },
    ],
  };
  await runWorkflow(x, cfg);
  assert.equal(x.status, "MANUAL_REVIEW");
});
test("configured schema rejects invalid email and out-of-range numeric input", async () => {
  const cfg = {
    ...base,
    inputSchema: {
      email: { type: "string", format: "email" },
      score: { type: "number", minimum: 300, maximum: 900 },
    },
  };
  const x = record({ name: "A", email: "not-an-email", score: 950 });
  await runWorkflow(x, cfg);
  assert.equal(x.status, "REJECTED");
  assert.match(x.explanation, /email/);
});
