import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    ok: true,
    service: "key-project-dashboard-api",
    time: new Date().toISOString(),
  });
});
