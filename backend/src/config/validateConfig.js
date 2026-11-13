import { AppError } from "../utils/errors.js";
export function validateConfig(config) {
  if (
    !config ||
    typeof config !== "object" ||
    !/^[a-z0-9-]{3,80}$/i.test(config.id || "") ||
    !config.name ||
    !Number.isInteger(config.version) ||
    config.version < 1 ||
    !Array.isArray(config.requiredFields) ||
    !config.requiredFields.length ||
    !Array.isArray(config.rules)
  )
    throw new AppError(
      "Config requires id, name, positive integer version, requiredFields and rules.",
      400,
      "INVALID_CONFIG",
    );
  if (
    config.inputSchema !== undefined &&
    (!config.inputSchema ||
      typeof config.inputSchema !== "object" ||
      Array.isArray(config.inputSchema))
  )
    throw new AppError(
      "inputSchema must be an object keyed by field name.",
      400,
      "INVALID_CONFIG",
    );
  for (const [field, schema] of Object.entries(config.inputSchema || {})) {
    if (
      !field ||
      !["string", "number", "boolean"].includes(schema?.type) ||
      (schema.format &&
        !(schema.type === "string" && schema.format === "email"))
    )
      throw new AppError(
        `Invalid input schema for ${field}.`,
        400,
        "INVALID_CONFIG",
      );
  }
  const ids = new Set();
  for (const r of config.rules) {
    if (!r.id || ids.has(r.id))
      throw new AppError(
        "Every rule must have a unique id.",
        400,
        "INVALID_CONFIG",
      );
    ids.add(r.id);
    if (!["required", "threshold", "expression"].includes(r.type))
      throw new AppError(
        `Unsupported rule type in ${r.id}.`,
        400,
        "INVALID_CONFIG",
      );
    if (r.onFail && !["REJECT", "MANUAL_REVIEW"].includes(r.onFail))
      throw new AppError(`Invalid onFail in ${r.id}.`, 400, "INVALID_CONFIG");
    if (
      r.type === "threshold" &&
      (!r.field ||
        ![">", ">=", "<", "<=", "==", "===", "!=", "!=="].includes(
          r.operator,
        ) ||
        r.value === undefined ||
        !Number.isFinite(Number(r.value)))
    )
      throw new AppError(
        `Invalid threshold rule: ${r.id}.`,
        400,
        "INVALID_CONFIG",
      );
    if (r.type === "required" && !r.field)
      throw new AppError(
        `Required rule ${r.id} needs a field.`,
        400,
        "INVALID_CONFIG",
      );
    if (r.type === "expression" && !r.expression)
      throw new AppError(
        `Expression rule ${r.id} needs an expression.`,
        400,
        "INVALID_CONFIG",
      );
  }
  return config;
}
