import express from "express";
import cors from "cors";
import morgan from "morgan";
import routes from "./routes/workflowRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(",") || "http://localhost:5173",
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    service: "resilient-decision-system",
    timestamp: new Date().toISOString(),
  }),
);
app.use("/api", routes);
app.use((req, res) =>
  res
    .status(404)
    .json({
      success: false,
      code: "ROUTE_NOT_FOUND",
      message: "API route not found.",
    }),
);
app.use(errorHandler);
export default app;
