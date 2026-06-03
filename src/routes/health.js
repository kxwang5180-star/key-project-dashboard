import { Router } from "express";
import { asyncRoute } from "../lib/async-route.js";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    ok: true,
    service: "key-project-dashboard-api",
    time: new Date().toISOString(),
  });
}));
