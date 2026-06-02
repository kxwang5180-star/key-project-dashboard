import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function signScopedToken(payload, expiresIn = "10m") {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export function readBearerToken(header = "") {
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((result, item) => {
      const index = item.indexOf("=");
      if (index < 0) return result;
      const key = item.slice(0, index).trim();
      const value = decodeURIComponent(item.slice(index + 1).trim());
      result[key] = value;
      return result;
    }, {});
}

export function buildAuthCookie(token) {
  const parts = [
    `app_token=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

export function buildExpiredAuthCookie() {
  const parts = [
    "app_token=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (config.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}
