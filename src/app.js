import cors from "cors";
import express from "express";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { feishuCallbackRouter } from "./routes/feishu-callbacks.js";
import { governanceRouter } from "./routes/governance.js";
import { healthRouter } from "./routes/health.js";
import { projectRouter } from "./routes/projects.js";
import { reportRouter } from "./routes/reports.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  app.get("/api", (_req, res) => {
    res.json({
      service: "key-project-dashboard-api",
      version: "0.1.0",
    });
  });

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/feishu/callback", feishuCallbackRouter);
  app.use("/api/bootstrap", bootstrapRouter);
  app.use("/api/projects", projectRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/governance", governanceRouter);

  app.use("/api", (req, res) => {
    res.status(404).json({
      message: `API 不存在：${req.originalUrl}`,
    });
  });

  app.use("/index.html", express.static(path.join(rootDir, "index.html")));
  app.use("/styles.css", express.static(path.join(rootDir, "styles.css")));
  app.use("/app.js", express.static(path.join(rootDir, "app.js")));
  app.use("/data.js", express.static(path.join(rootDir, "data.js")));
  app.use("/src", express.static(path.join(rootDir, "src")));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({
      message: "服务器内部错误",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  });

  return app;
}
