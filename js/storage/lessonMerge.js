// Protect only against catastrophic shrink (half gone / 20+ missing).
// Normal cleanup deletes must sync to other devices.
const PROTECT_MIN_LOST = 20;
const PROTECT_RATIO = 0.5;

function itemKey(item) {
  if (!item || typeof item !== "object") return "";
  const id = String(item.id || "").trim();
  if (id) return id;
  const phrase = String(item.phrase || "").trim().toLowerCase();
  return phrase ? `phrase:${phrase}` : "";
}

function isNewer(a, b) {
  return String(a?.updatedAt || "") >= String(b?.updatedAt || "");
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
  const trustIncoming =
    isNewer(incoming, existing) &&
    !shouldProtectList(incoming.expressions, existing.expressions) &&
    !shouldProtectList(incoming.listeningPoints, existing.listeningPoints);
  if (trustIncoming) return next;

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
  if (shouldProtectList(preferred.expressions, other.expressions)) {
    next.expressions = mergeItemLists(preferred.expressions, other.expressions);
  } else {
    next.expressions = Array.isArray(preferred.expressions) ? preferred.expressions : [];
  }
  if (shouldProtectList(preferred.listeningPoints, other.listeningPoints)) {
    next.listeningPoints = mergeItemLists(preferred.listeningPoints, other.listeningPoints);
  } else {
    next.listeningPoints = Array.isArray(preferred.listeningPoints) ? preferred.listeningPoints : [];
  }
  return next;
}
