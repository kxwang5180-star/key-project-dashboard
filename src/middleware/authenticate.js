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
      },
    });
    if (!user) return res.status(401).json({ message: "用户不存在" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "登录状态无效，请重新登录" });
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
