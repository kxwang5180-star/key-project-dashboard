import { Router } from "express";
import { config } from "../config.js";
import { asyncRoute } from "../lib/async-route.js";
import {
  buildFeishuCardCallbackAuditDetail,
  getFeishuCardActionValue,
  resolveFeishuChallengeResponse,
  verifyFeishuCallbackToken,
} from "../services/feishu-callback-records.js";
import { buildMilestoneReminderCallbackResponse } from "../services/milestone-reminder-cards.js";
import { writeAuditLog } from "../services/audit-log.js";

export const feishuCallbackRouter = Router();

feishuCallbackRouter.post("/", asyncRoute(async (req, res) => {
  const payload = req.body || {};
  const challengeResponse = resolveFeishuChallengeResponse(payload);
  if (challengeResponse) return res.json(challengeResponse);

  const tokenCheck = verifyFeishuCallbackToken(payload, config.feishu.callbackVerificationToken);
  if (!tokenCheck.ok) return res.status(401).json({ message: "invalid verification token" });

  const actionValue = getFeishuCardActionValue(payload);
  const response = buildMilestoneReminderCallbackResponse(actionValue);

  await writeAuditLog({
    action: "feishu.card.callback",
    targetType: "FeishuCard",
    targetId: String(payload?.header?.event_id || payload?.event_id || Date.now()),
    detail: buildFeishuCardCallbackAuditDetail(payload),
  });

  return res.json(response);
}));
