import mongoose from "mongoose";
const auditSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    stage: String,
    action: String,
    message: String,
    ruleId: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { _id: false },
);
const requestSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    workflowId: { type: String, required: true },
    workflowVersion: { type: Number, required: true },
    configSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "APPROVED",
        "REJECTED",
        "MANUAL_REVIEW",
        "RETRY_PENDING",
      ],
      default: "PENDING",
      index: true,
    },
    decision: {
      type: String,
      enum: ["APPROVE", "REJECT", "MANUAL_REVIEW", null],
      default: null,
    },
    explanation: { type: String, default: "" },
    lastError: String,
    retryCount: { type: Number, default: 0 },
    ruleTrace: { type: [mongoose.Schema.Types.Mixed], default: [] },
    audit: { type: [auditSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);
export default mongoose.model("WorkflowRequest", requestSchema);
