export function normalizeSeedKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，。；;：:、,]/g, "")
    .trim()
    .toLowerCase();
}

function toDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function milestoneSeedKey(milestone) {
  return `${normalizeSeedKey(milestone?.title)}|${toDateKey(milestone?.dueDate)}`;
}

export function metricSeedKey(metric) {
  return [
    normalizeSeedKey(metric?.name),
    normalizeSeedKey(metric?.targetValue ?? metric?.target),
    normalizeSeedKey(metric?.observation),
  ].join("|");
}

export function getRelationCount(record, relationName) {
  return Number(record?._count?.[relationName] || 0);
}

export function withoutId(record) {
  const { id: _id, ...rest } = record || {};
  return rest;
}

export function planSeedRecordReconciliation({
  existingRecords = [],
  desiredRecords = [],
  getExistingKey,
  getDesiredKey,
  relationName,
  preferDesiredId = false,
}) {
  const usedExistingIds = new Set();
  const existingById = new Map(existingRecords.map((record) => [record.id, record]));
  const existingByKey = new Map();

  for (const record of existingRecords) {
    const key = getExistingKey(record);
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(record);
  }

  const updates = [];
  const creates = [];

  for (const desired of desiredRecords) {
    const desiredId = String(desired?.id || "").trim();
    const idMatched = preferDesiredId && desiredId ? existingById.get(desiredId) : null;
    const candidates = idMatched ? [idMatched] : existingByKey.get(getDesiredKey(desired)) || [];
    const existing = candidates.find((record) => !usedExistingIds.has(record.id));
    if (existing) {
      usedExistingIds.add(existing.id);
      updates.push({ existing, desired });
    } else {
      creates.push(desired);
    }
  }

  const leftovers = existingRecords.filter((record) => !usedExistingIds.has(record.id));
  return {
    updates,
    creates,
    deleteIds: leftovers.filter((record) => getRelationCount(record, relationName) === 0).map((record) => record.id),
    archive: leftovers.filter((record) => getRelationCount(record, relationName) > 0),
  };
}
