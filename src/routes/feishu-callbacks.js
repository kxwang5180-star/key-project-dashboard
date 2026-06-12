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
import {
  isMilestoneDoneAction,
  loadMilestoneReminderTargetsByIds,
  markMilestoneReminderDone,
  normalizeCallbackMilestoneIds,
} from "../services/feishu-card-callbacks.js";
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
  const action = String(actionValue?.action || "").trim();
  const milestoneIds = normalizeCallbackMilestoneIds(actionValue);
  let response = buildMilestoneReminderCallbackResponse(actionValue);
  let updatedCount = null;

  if (isMilestoneDoneAction(action) && milestoneIds.length) {
    const targets = Array.isArray(actionValue.targets) && actionValue.targets.length
      ? actionValue.targets
      : await loadMilestoneReminderTargetsByIds({ client: prisma, milestoneIds });
    if (!targets.length) {
      response = {
        toast: {
          type: "warning",
          content: "未找到匹配里程碑，未更新状态",
        },
      };
    } else {
      const updateResult = await markMilestoneReminderDone({ client: prisma, milestoneIds });
      updatedCount = updateResult?.count ?? 0;
      response = buildMilestoneReminderCallbackResponse({
        ...actionValue,
        targets,
      });
      if (!updatedCount) {
        response.toast.content = "里程碑已是完成状态";
      }
    }

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
    detail: {
      ...buildFeishuCardCallbackAuditDetail(payload),
      updatedCount,
    },
  });

  return res.json(response);
}));
