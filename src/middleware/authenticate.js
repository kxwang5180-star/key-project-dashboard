import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { parseCookies, readBearerToken, verifyToken } from "../lib/auth.js";

export async function authenticate(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = readBearerToken(req.headers.authorization) || cookies.app_token || null;
    if (!token) return res.status(401).json({ message: "未登录" });
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        defaultProjectId: true,
        avatarUrl: true,
        feishuOpenId: true,
        feishuUnionId: true,
        feishuUserId: true,
      },
    });
    if (!user) return res.status(401).json({ message: "用户不存在" });
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof jwt.NotBeforeError) {
      return res.status(401).json({ message: "登录状态无效，请重新登录" });
    }
    console.error("Authentication error:", error);
    res.status(503).json({ message: "服务暂时不可用，请稍后重试" });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "未登录" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "没有权限执行该操作" });
    }
    next();
  };
}
