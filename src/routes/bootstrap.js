import { Router } from "express";
import { asyncRoute } from "../lib/async-route.js";
import { authenticate } from "../middleware/authenticate.js";
import { getBootstrapPayload } from "../services/bootstrap.js";

export const bootstrapRouter = Router();

bootstrapRouter.get("/", authenticate, asyncRoute(async (req, res) => {
  const payload = await getBootstrapPayload(req.user);
  res.json(payload);
}));
