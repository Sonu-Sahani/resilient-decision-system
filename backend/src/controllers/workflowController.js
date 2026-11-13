import * as service from "../services/workflowService.js";
import WorkflowRequest from "../models/WorkflowRequest.js";
import { AppError } from "../utils/errors.js";
export async function submit(req, res, next) {
  try {
    const { record, replayed } = await service.createRequest(
      req.body,
      req.get("Idempotency-Key"),
    );
    res
      .status(replayed ? 200 : 201)
      .json({ success: true, replayed, data: record });
  } catch (e) {
    next(e);
  }
}
export async function list(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = req.query.status
      ? { status: req.query.status.toUpperCase() }
      : {};
    const [data, total] = await Promise.all([
      WorkflowRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-configSnapshot")
        .lean(),
      WorkflowRequest.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    next(e);
  }
}
export async function getOne(req, res, next) {
  try {
    const data = await WorkflowRequest.findById(req.params.id).lean();
    if (!data) throw new AppError("Request not found.", 404, "NOT_FOUND");
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}
export async function retry(req, res, next) {
  try {
    const data = await service.retryRequest(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}
export async function config(req, res, next) {
  try {
    if (req.method === "GET")
      return res.json({ success: true, data: await service.getConfig() });
    if (
      process.env.ADMIN_API_KEY &&
      req.get("x-admin-key") !== process.env.ADMIN_API_KEY
    )
      throw new AppError(
        "Valid admin key required to update workflow configuration.",
        401,
        "UNAUTHORIZED",
      );
    const data = await service.saveConfig(req.body);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}
export async function metrics(req, res, next) {
  try {
    const [total, grouped] = await Promise.all([
      WorkflowRequest.countDocuments(),
      WorkflowRequest.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        total,
        byStatus: Object.fromEntries(grouped.map((x) => [x._id, x.count])),
      },
    });
  } catch (e) {
    next(e);
  }
}
