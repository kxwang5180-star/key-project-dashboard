const OBSERVABLE_MARKER_PATTERN = /[;；]\s*可观测\s*[:：]\s*/;
const LEADING_OBSERVABLE_PATTERN = /^可观测\s*[:：]\s*/;

export function splitMetricObservation(value = "", fallbackObservable = "") {
  const source = String(value || "").trim();
  const fallback = String(fallbackObservable || "").trim();
  if (!source) return { observation: "", observable: fallback };

  const parts = source.split(OBSERVABLE_MARKER_PATTERN);
  if (parts.length > 1) {
    return {
      observation: parts[0].trim(),
      observable: parts.slice(1).join("；可观测：").trim() || fallback,
    };
  }

  if (LEADING_OBSERVABLE_PATTERN.test(source)) {
    return {
      observation: "",
      observable: source.replace(LEADING_OBSERVABLE_PATTERN, "").trim() || fallback,
    };
  }

  return { observation: source, observable: fallback };
}

export function buildMetricObservation({ observation = "", observable = "" } = {}) {
  const formula = String(observation || "").trim();
  const time = String(observable || "").trim();
  if (formula && time) return `${formula}；可观测：${time}`;
  if (formula) return formula;
  if (time) return `可观测：${time}`;
  return "";
}
