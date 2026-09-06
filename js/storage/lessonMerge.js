const PROTECT_MIN_LOST = 5;
const PROTECT_RATIO = 0.7;

function itemKey(item) {
  if (!item || typeof item !== "object") return "";
  const id = String(item.id || "").trim();
  if (id) return id;
  const phrase = String(item.phrase || "").trim().toLowerCase();
  return phrase ? `phrase:${phrase}` : "";
}

export function mergeItemLists(primary, secondary) {
  const map = new Map();
  for (const item of secondary || []) {
    const key = itemKey(item);
    if (key) map.set(key, item);
  }
  for (const item of primary || []) {
    const key = itemKey(item);
    if (key) map.set(key, item);
  }
  return [...map.values()];
}

export function shouldProtectList(incoming, existing) {
  const incomingN = Array.isArray(incoming) ? incoming.length : 0;
  const existingN = Array.isArray(existing) ? existing.length : 0;
  if (!existingN || incomingN >= existingN) return false;
  const lost = existingN - incomingN;
  return lost >= PROTECT_MIN_LOST || incomingN < existingN * PROTECT_RATIO;
}

export function protectLesson(incoming, existing) {
  if (!incoming || !existing) return incoming;
  const next = { ...incoming };
  if (shouldProtectList(incoming.expressions, existing.expressions)) {
    next.expressions = mergeItemLists(incoming.expressions, existing.expressions);
  }
  if (shouldProtectList(incoming.listeningPoints, existing.listeningPoints)) {
    next.listeningPoints = mergeItemLists(incoming.listeningPoints, existing.listeningPoints);
  }
  return next;
}

export function mergeLessons(preferred, other) {
  if (!preferred) return other;
  if (!other) return preferred;
  const next = { ...preferred };
  next.expressions = mergeItemLists(preferred.expressions, other.expressions);
  next.listeningPoints = mergeItemLists(preferred.listeningPoints, other.listeningPoints);
  return next;
}
