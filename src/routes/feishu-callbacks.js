import { Router } from "express";
import { config } from "../config.js";
import { asyncRoute } from "../lib/async-route.js";
import { prisma } from "../lib/prisma.js";
import { fetchTenantAccessToken, updateFeishuCardMessage } from "../lib/feishu.js";
import {
  buildFeishuCardCallbackAuditDetail,
  getFeishuCardActionValue,
  getFeishuCallbackMessageId,
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
  const action = String(actionValue?.action || "").trim();
  const milestoneIds = Array.isArray(actionValue?.milestoneIds)
    ? actionValue.milestoneIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (action === "milestone_reminder_mark_done" && milestoneIds.length) {
    await prisma.milestone.updateMany({
      where: {
        id: { in: milestoneIds },
        status: { not: "COMPLETED" },
      },
      data: {
        status: "COMPLETED",
        changeSummary: "通过飞书里程碑提醒卡片确认完成",
      },
    });

    const messageId = getFeishuCallbackMessageId(payload);
    if (messageId && response.card) {
      const tenantAccessToken = await fetchTenantAccessToken();
      await updateFeishuCardMessage({
        messageId,
        card: response.card,
        tenantAccessToken,
      });
    }
  }

  await writeAuditLog({
    action: "feishu.card.callback",
    targetType: "FeishuCard",
    targetId: String(payload?.header?.event_id || payload?.event_id || Date.now()),
    detail: buildFeishuCardCallbackAuditDetail(payload),
  });

  return res.json(response);
}));
