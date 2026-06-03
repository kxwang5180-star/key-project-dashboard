import { prisma } from "../lib/prisma.js";
import { buildAuditLogRecord } from "./audit-log-records.js";

export async function writeAuditLog({ client = prisma, ...input }) {
  return client.auditLog.create({
    data: buildAuditLogRecord(input),
  });
}
