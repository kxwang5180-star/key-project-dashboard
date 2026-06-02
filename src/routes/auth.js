import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { comparePassword, hashPassword, signScopedToken, signToken, buildAuthCookie, buildExpiredAuthCookie, verifyToken } from "../lib/auth.js";
import { authenticate, requireRoles } from "../middleware/authenticate.js";
import { config } from "../config.js";
import {
  assertFeishuUserAllowed,
  buildFeishuAuthorizeUrl,
  exchangeFeishuCode,
  fetchFeishuUserInfo,
  getSafeRedirectPath,
  getUserEmailOrFallback,
  mapRoleFromFeishuUser,
} from "../lib/feishu.js";
import { ensureUserProjectMembershipLinks, getAllowedProjectIdsForUser } from "../services/project-members.js";
import { buildFeishuTokenData, syncMyFeishuChatsAndMembers } from "../services/feishu-chat-sync.js";

export const authRouter = Router();

function toPublicUser(user, allowedProjectIds = []) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleKey: user.role,
    defaultProjectId: user.defaultProjectId,
    projectId: user.defaultProjectId,
    projectIds: allowedProjectIds,
    avatarUrl: user.avatarUrl || null,
    feishuLinked: Boolean(user.feishuOpenId || user.feishuUnionId),
  };
}

function ensureFeishuEnabled(res) {
  if (config.feishu.enabled) return true;
  res.status(503).json({ message: "飞书登录尚未配置完成" });
  return false;
}

authRouter.post("/register", async (req, res) => {
  const { name, email, password, defaultProjectId = null } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "姓名、邮箱、密码必填" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ message: "该邮箱已注册" });

  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: await hashPassword(String(password)),
      role: "MEMBER",
      defaultProjectId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      defaultProjectId: true,
    },
  });

  res.setHeader("Set-Cookie", buildAuthCookie(signToken(user)));
  res.status(201).json({
    token: signToken(user),
    user: toPublicUser(user),
  });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "邮箱和密码必填" });
  }

  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (!user || !user.passwordHash) return res.status(401).json({ message: "账号或密码错误" });

  const matched = await comparePassword(String(password), user.passwordHash);
  if (!matched) return res.status(401).json({ message: "账号或密码错误" });

  res.setHeader("Set-Cookie", buildAuthCookie(signToken(user)));
  res.json({
    token: signToken(user),
    user: toPublicUser(user),
  });
});

authRouter.get("/feishu/login", async (req, res) => {
  if (!ensureFeishuEnabled(res)) return;
  const redirectPath = getSafeRedirectPath(req.query.redirect);
  const state = signScopedToken(
    {
      purpose: "feishu_oauth_state",
      redirectPath,
    },
    "10m"
  );
  const authorizeUrl = buildFeishuAuthorizeUrl(state);
  res.redirect(authorizeUrl);
});

authRouter.get("/feishu/callback", async (req, res) => {
  if (!ensureFeishuEnabled(res)) return;

  const { code, state, error, error_description: errorDescription } = req.query || {};
  if (error) {
    return res.status(401).send(`飞书授权失败：${String(errorDescription || error)}`);
  }
  if (!code || !state) {
    return res.status(400).send("缺少飞书授权回调参数");
  }

  let redirectPath = config.feishu.postLoginRedirect;
  try {
    const payload = verifyToken(String(state));
    if (payload?.purpose !== "feishu_oauth_state") throw new Error("Invalid state");
    redirectPath = getSafeRedirectPath(payload.redirectPath);
  } catch {
    return res.status(400).send("飞书授权状态校验失败，请重新登录");
  }

  try {
    const tokenData = await exchangeFeishuCode(String(code));
    const userInfo = await fetchFeishuUserInfo(tokenData.access_token);
    assertFeishuUserAllowed(userInfo);

    const email = getUserEmailOrFallback(userInfo);
    const role = mapRoleFromFeishuUser(userInfo);

    let user =
      (userInfo.union_id && (await prisma.user.findUnique({ where: { feishuUnionId: userInfo.union_id } }))) ||
      (userInfo.open_id && (await prisma.user.findUnique({ where: { feishuOpenId: userInfo.open_id } }))) ||
      (await prisma.user.findUnique({ where: { email } }));

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: String(userInfo.name || user.name).trim(),
          email,
          role,
          feishuOpenId: userInfo.open_id || user.feishuOpenId,
          feishuUnionId: userInfo.union_id || user.feishuUnionId,
          feishuUserId: userInfo.user_id || user.feishuUserId,
          avatarUrl: userInfo.avatar_url || user.avatarUrl,
          ...buildFeishuTokenData(tokenData),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: String(userInfo.name || "飞书用户").trim(),
          email,
          role,
          feishuOpenId: userInfo.open_id || null,
          feishuUnionId: userInfo.union_id || null,
          feishuUserId: userInfo.user_id || null,
          avatarUrl: userInfo.avatar_url || null,
          ...buildFeishuTokenData(tokenData),
        },
      });
    }

    const appToken = signToken(user);
    res.setHeader("Set-Cookie", buildAuthCookie(appToken));
    res.redirect(302, redirectPath);
  } catch (error) {
    res.status(401).send(`飞书登录处理失败：${error.message}`);
  }
});

authRouter.get("/me", authenticate, async (req, res) => {
  await ensureUserProjectMembershipLinks(req.user);
  const allowedProjectIds = await getAllowedProjectIdsForUser(req.user);
  res.json({ user: toPublicUser(req.user, allowedProjectIds) });
});

authRouter.get("/users", authenticate, requireRoles("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      defaultProjectId: true,
      avatarUrl: true,
      feishuOpenId: true,
      feishuUnionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({
    users: users.map((user) => toPublicUser(user)),
  });
});

authRouter.post("/feishu/my-chats/sync", authenticate, requireRoles("ADMIN"), async (req, res) => {
  const result = await syncMyFeishuChatsAndMembers(req.user.id);
  res.json({
    ok: true,
    ...result,
  });
});

authRouter.get("/feishu/chats", authenticate, requireRoles("ADMIN"), async (_req, res) => {
  const chats = await prisma.feishuChat.findMany({
    orderBy: [{ lastSyncedAt: "desc" }, { name: "asc" }],
    include: {
      members: {
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          memberId: true,
          name: true,
          email: true,
          userId: true,
        },
      },
    },
  });

  res.json({
    chats: chats.map((chat) => ({
      chatId: chat.chatId,
      name: chat.name,
      description: chat.description,
      memberCount: chat.memberCount,
      lastSyncedAt: chat.lastSyncedAt,
      members: chat.members,
    })),
  });
});

authRouter.put("/users/:id", authenticate, requireRoles("ADMIN"), async (req, res) => {
  const { role, defaultProjectId = null } = req.body || {};
  const nextRole = role === "ADMIN" ? "ADMIN" : "MEMBER";
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      role: nextRole,
      defaultProjectId: defaultProjectId || null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      defaultProjectId: true,
      avatarUrl: true,
      feishuOpenId: true,
      feishuUnionId: true,
    },
  });
  res.json({
    user: toPublicUser(user),
  });
});

authRouter.post("/logout", async (_req, res) => {
  res.setHeader("Set-Cookie", buildExpiredAuthCookie());
  res.json({ ok: true });
});
