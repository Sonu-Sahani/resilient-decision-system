import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config/validateConfig.js";
const valid = {
  id: "approval-flow",
  name: "Approval",
  version: 1,
  requiredFields: ["name"],
  rules: [
    {
      id: "r1",
      type: "threshold",
      field: "score",
      operator: ">=",
      value: 600,
      onFail: "REJECT",
    },
  ],
};
test("valid configuration is accepted", () =>
  assert.equal(validateConfig(structuredClone(valid)).id, valid.id));
test("duplicate rule ids are rejected", () => {
  const c = structuredClone(valid);
  c.rules.push({ ...c.rules[0] });
  assert.throws(() => validateConfig(c), /unique id/);
});
test("unsafe or unsupported rule types are rejected", () => {
  const c = structuredClone(valid);
  c.rules[0].type = "javascript";
  assert.throws(() => validateConfig(c), /Unsupported rule type/);
});
test("invalid operators are rejected", () => {
  const c = structuredClone(valid);
  c.rules[0].operator = "LIKE";
  assert.throws(() => validateConfig(c), /Invalid threshold/);
});
