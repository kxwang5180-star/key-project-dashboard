import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getBootstrapPayload } from "../services/bootstrap.js";

export const bootstrapRouter = Router();

bootstrapRouter.get("/", authenticate, async (_req, res) => {
  const payload = await getBootstrapPayload();
  res.json(payload);
});
