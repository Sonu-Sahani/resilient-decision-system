import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WorkflowRequest from "../models/WorkflowRequest.js";
import { runWorkflow } from "../engine/workflowEngine.js";
import { AppError } from "../utils/errors.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(here, "../config/workflow.json");
export async function getConfig() {
  return JSON.parse(await fs.readFile(configPath, "utf8"));
}
export { validateConfig } from "../config/validateConfig.js";
import { validateConfig } from "../config/validateConfig.js";
export async function saveConfig(next) {
  validateConfig(next);
  const current = await getConfig();
  if (next.id !== current.id)
    throw new AppError(
      "Workflow id cannot be changed by this endpoint.",
      400,
      "INVALID_CONFIG",
    );
  if (next.version <= current.version)
    throw new AppError(
      "Config version must increase when rules change.",
      409,
      "VERSION_CONFLICT",
    );
  const temp = `${configPath}.tmp`;
  await fs.writeFile(temp, JSON.stringify(next, null, 2));
  await fs.rename(temp, configPath);
  return next;
}
export async function createRequest(input, key) {
  if (!key || key.length > 200)
    throw new AppError(
      "A valid Idempotency-Key header (1-200 characters) is required.",
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  const existing = await WorkflowRequest.findOne({ idempotencyKey: key });
  if (existing) return { record: existing, replayed: true };
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError(
      "Request body must be a JSON object.",
      400,
      "INVALID_INPUT",
    );
  const config = validateConfig(await getConfig());
  const record = new WorkflowRequest({
    idempotencyKey: key,
    workflowId: config.id,
    workflowVersion: config.version,
    configSnapshot: config,
    input,
    status: "PENDING",
  });
  await runWorkflow(record, config, {
    maxRetries: Number(process.env.MAX_RETRIES || 3),
  });
  try {
    await record.save();
    return { record, replayed: false };
  } catch (e) {
    if (e.code === 11000) {
      const duplicate = await WorkflowRequest.findOne({ idempotencyKey: key });
      return { record: duplicate, replayed: true };
    }
    throw e;
  }
}
export async function retryRequest(id) {
  const record = await WorkflowRequest.findById(id);
  if (!record) throw new AppError("Request not found.", 404, "NOT_FOUND");
  if (record.status !== "RETRY_PENDING")
    throw new AppError(
      "Only RETRY_PENDING requests can be retried.",
      409,
      "INVALID_STATE",
    );
  const config = record.configSnapshot || (await getConfig());
  await runWorkflow(record, config, {
    maxRetries: Number(process.env.MAX_RETRIES || 3),
  });
  await record.save();
  return record;
}
