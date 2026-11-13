import { evaluateRules } from "./ruleEngine.js";
const audit = (stage, action, message, details = {}) => ({
  at: new Date(),
  stage,
  action,
  message,
  details,
});
export async function runWorkflow(
  record,
  config,
  { maxRetries = 3, dependency } = {},
) {
  record.audit ||= [];
  record.retryCount ||= 0;
  record.audit.push(
    audit("INTAKE", "RECEIVED", "Request accepted for processing.", {
      workflowId: config.id,
      workflowVersion: config.version,
    }),
  );
  for (const field of config.requiredFields || []) {
    const value = field
      .split(".")
      .reduce((v, k) => (v == null ? undefined : v[k]), record.input);
    if (value === undefined || value === null || value === "") {
      record.status = "REJECTED";
      record.decision = "REJECT";
      record.explanation = `Missing required field: ${field}`;
      record.audit.push(
        audit("VALIDATE", "FAILED", record.explanation, { field }),
      );
      return record;
    }
  }
  for (const [field, schema] of Object.entries(config.inputSchema || {})) {
    const value = field
      .split(".")
      .reduce((v, k) => (v == null ? undefined : v[k]), record.input);
    if (value === undefined || value === null) continue;
    let valid = true;
    if (schema.type === "string")
      valid =
        typeof value === "string" &&
        value.length >= (schema.minLength || 0) &&
        value.length <= (schema.maxLength || Infinity);
    else if (schema.type === "number")
      valid =
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (schema.minimum ?? -Infinity) &&
        value <= (schema.maximum ?? Infinity);
    else if (schema.type === "boolean") valid = typeof value === "boolean";
    if (valid && schema.format === "email")
      valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!valid) {
      record.status = "REJECTED";
      record.decision = "REJECT";
      record.explanation = `Invalid value for field: ${field}`;
      record.audit.push(
        audit("VALIDATE", "FAILED", record.explanation, {
          field,
          expected: schema,
        }),
      );
      return record;
    }
  }
  record.audit.push(
    audit(
      "VALIDATE",
      "PASSED",
      "Required-field and configured schema validation passed.",
    ),
  );
  const { outcome, trace } = evaluateRules(config.rules, record.input);
  record.ruleTrace = trace;
  for (const item of trace)
    record.audit.push({
      ...audit("RULES", item.passed ? "PASSED" : "FAILED", item.message, {
        onFail: item.onFail,
      }),
      ruleId: item.ruleId,
    });
  if (outcome === "REJECT") {
    record.status = "REJECTED";
    record.decision = "REJECT";
    record.explanation = "A configured mandatory rule failed.";
    record.audit.push(audit("FINALIZE", "REJECTED", record.explanation));
    return record;
  }
  if (outcome === "MANUAL_REVIEW") {
    record.status = "MANUAL_REVIEW";
    record.decision = "MANUAL_REVIEW";
    record.explanation = "A configured rule requires human review.";
    record.audit.push(audit("FINALIZE", "MANUAL_REVIEW", record.explanation));
    return record;
  }
  record.status = "PROCESSING";
  record.audit.push(
    audit(
      "EXTERNAL_VERIFICATION",
      "STARTED",
      "Calling simulated external verification provider.",
    ),
  );
  try {
    const result = dependency
      ? await dependency(record.input)
      : await simulateDependency(record.input);
    if (!result?.ok)
      throw Object.assign(
        new Error(result?.message || "External provider unavailable."),
        { transient: result?.transient !== false },
      );
    record.audit.push(
      audit(
        "EXTERNAL_VERIFICATION",
        "PASSED",
        "External verification succeeded.",
        { provider: result.provider || "SIMULATED" },
      ),
    );
    record.status = "APPROVED";
    record.decision = "APPROVE";
    record.explanation =
      "All configured rules and external verification passed.";
    record.audit.push(audit("FINALIZE", "APPROVED", record.explanation));
  } catch (err) {
    record.retryCount += 1;
    record.lastError = err.message;
    record.audit.push(
      audit("EXTERNAL_VERIFICATION", "FAILED", err.message, {
        attempt: record.retryCount,
        transient: err.transient !== false,
      }),
    );
    if (err.transient === false || record.retryCount >= maxRetries) {
      record.status = "MANUAL_REVIEW";
      record.decision = "MANUAL_REVIEW";
      record.explanation =
        err.transient === false
          ? "External verification failed permanently; manual review required."
          : "Retry limit reached; manual review required.";
      record.audit.push(audit("FINALIZE", "MANUAL_REVIEW", record.explanation));
    } else {
      record.status = "RETRY_PENDING";
      record.decision = null;
      record.explanation =
        "External verification temporarily unavailable. Retry is available.";
    }
  }
  return record;
}
async function simulateDependency(input) {
  // Deterministic failure injection for the demo: failuresRemaining decrements on each attempt.
  const remaining = Number(input.externalCheck?.failuresRemaining || 0);
  if (remaining > 0) {
    input.externalCheck.failuresRemaining = remaining - 1;
    return {
      ok: false,
      transient: true,
      message: "Simulated verification provider timeout.",
    };
  }
  if (input.externalCheck?.forcePermanentFailure)
    return {
      ok: false,
      transient: false,
      message: "Simulated permanent provider rejection.",
    };
  return { ok: true, provider: "DEMO_VERIFICATION_PROVIDER" };
}
