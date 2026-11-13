import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";
const port = process.env.PORT || 5000;
try {
  await mongoose.connect(
    process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/resilient_decision_system",
  );
  console.log("MongoDB connected");
  app.listen(port, () =>
    console.log(`API listening on http://localhost:${port}`),
  );
} catch (e) {
  console.error("Startup failed:", e.message);
  process.exit(1);
}
