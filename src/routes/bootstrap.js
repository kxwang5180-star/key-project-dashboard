import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getBootstrapPayload } from "../services/bootstrap.js";

export const bootstrapRouter = Router();

bootstrapRouter.get("/", authenticate, async (req, res) => {
  const payload = await getBootstrapPayload(req.user);
  res.json(payload);
});
