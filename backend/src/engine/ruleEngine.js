const OPS = new Set([">", ">=", "<", "<=", "==", "===", "!=", "!=="]);
const compare = (a, op, b) => {
  if (!OPS.has(op)) throw new Error(`Unsupported operator: ${op}`);
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "==":
      return a == b; // intentional configurable loose comparison
    case "===":
      return a === b;
    case "!=":
      return a != b;
    case "!==":
      return a !== b;
  }
};
function resolvePath(obj, path) {
  return path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), obj);
}
function evaluateExpression(expression, data) {
  // Deliberately small, safe expression grammar. Never evaluate arbitrary JavaScript.
  const m =
    /^([a-zA-Z][\w.]*)\s*(<=|>=|===|==|!==|!=|<|>)\s*([a-zA-Z][\w.]*|\d+(?:\.\d+)?)(?:\s*\*\s*(\d+(?:\.\d+)?))?$/.exec(
      expression || "",
    );
  if (!m) throw new Error(`Unsupported rule expression: ${expression}`);
  const [, left, op, right, multiplier] = m;
  const rawA = resolvePath(data, left);
  const rawB = resolvePath(data, right);
  const a = Number(rawA);
  const b =
    (rawB === undefined ? Number(right) : Number(rawB)) *
    (multiplier ? Number(multiplier) : 1);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return compare(a, op, b);
}
export function evaluateRules(rules, data) {
  if (!Array.isArray(rules))
    throw new Error("Workflow rules must be an array.");
  r;
  const trace = [];
  let outcome = "APPROVE";
  for (const rule of rules) {
    let passed;
    if (rule.type === "required") {
      const v = resolvePath(data, rule.field);
      passed = v !== undefined && v !== null && String(v).trim() !== "";
    } else if (rule.type === "threshold") {
      const v = Number(resolvePath(data, rule.field));
      const target = Number(rule.value);
      passed =
        Number.isFinite(v) &&
        Number.isFinite(target) &&
        compare(v, rule.operator, target);
    } else if (rule.type === "expression")
      passed = evaluateExpression(rule.expression, data);
    else throw new Error(`Unknown rule type: ${rule.type}`);
    trace.push({
      ruleId: rule.id,
      type: rule.type,
      passed,
      onFail: rule.onFail || null,
      message: passed
        ? rule.passMessage || "Rule passed."
        : rule.message || `Rule ${rule.id} failed.`,
    });
    if (!passed && rule.onFail === "REJECT") outcome = "REJECT";
    else if (!passed && rule.onFail === "MANUAL_REVIEW" && outcome !== "REJECT")
      outcome = "MANUAL_REVIEW";
  }
  return { outcome, trace };
}
