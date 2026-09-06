// Protect only against catastrophic shrink (half gone / 20+ missing).
// Deleted ids are remembered so sync cannot resurrect them.
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

function asIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id || "").trim()).filter(Boolean);
}

function unionIds(...lists) {
  const set = new Set();
  for (const list of lists) {
    for (const id of asIdList(list)) set.add(id);
  }
  return set;
}

function idSet(items) {
  const set = new Set();
  for (const item of items || []) {
    const id = String(item?.id || "").trim();
    if (id) set.add(id);
  }
  return set;
}

function isIdSubset(smaller, larger) {
  const large = idSet(larger);
  if (!smaller?.length) return true;
  if (!large.size) return false;
  return smaller.every((item) => {
    const id = String(item?.id || "").trim();
    return id && large.has(id);
  });
}

function filterDeleted(items, deleted) {
  if (!deleted?.size) return [...(items || [])];
  return (items || []).filter((item) => {
    const id = String(item?.id || "").trim();
    const key = itemKey(item);
    if (id && deleted.has(id)) return false;
    if (key && deleted.has(key)) return false;
    return true;
  });
}

function itemTime(item) {
  const time = Date.parse(item?.createdAt || item?.updatedAt || "");
  return Number.isFinite(time) ? time : 0;
}

function lessonTime(lesson) {
  const time = Date.parse(lesson?.updatedAt || "");
  return Number.isFinite(time) ? time : 0;
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

export function rememberDeletedIds(lesson, ids, field = "deletedExpressionIds") {
  if (!lesson || !ids?.length) return lesson;
  const next = unionIds(lesson[field], ids);
  lesson[field] = [...next];
  return lesson;
}

export function forgetDeletedIds(lesson, ids, field = "deletedExpressionIds") {
  if (!lesson || !ids?.length) return lesson;
  const remove = new Set(asIdList(ids));
  lesson[field] = asIdList(lesson[field]).filter((id) => !remove.has(id));
  return lesson;
}

function chooseExpressionList(preferred, other) {
  const preferredList = Array.isArray(preferred?.expressions) ? preferred.expressions : [];
  const otherList = Array.isArray(other?.expressions) ? other.expressions : [];

  if (shouldProtectList(preferredList, otherList)) {
    return mergeItemLists(preferredList, otherList);
  }

  // Newer/larger list that only reintroduces older ids the smaller side already dropped:
  // treat as resurrected deletes and keep the smaller list, plus any truly new adds.
  if (
    otherList.length &&
    preferredList.length > otherList.length &&
    isIdSubset(otherList, preferredList)
  ) {
    const otherIds = idSet(otherList);
    const extras = preferredList.filter((item) => {
      const id = String(item?.id || "").trim();
      return id && !otherIds.has(id);
    });
    const cutoff = lessonTime(other);
    const genuineAdds = extras.filter((item) => itemTime(item) > cutoff);
    return mergeItemLists(otherList, genuineAdds);
  }

  return preferredList;
}

function chooseListeningList(preferred, other) {
  const preferredList = Array.isArray(preferred?.listeningPoints) ? preferred.listeningPoints : [];
  const otherList = Array.isArray(other?.listeningPoints) ? other.listeningPoints : [];
  if (shouldProtectList(preferredList, otherList)) {
    return mergeItemLists(preferredList, otherList);
  }
  if (
    otherList.length &&
    preferredList.length > otherList.length &&
    isIdSubset(otherList, preferredList)
  ) {
    const otherIds = idSet(otherList);
    const extras = preferredList.filter((item) => {
      const id = String(item?.id || "").trim();
      return id && !otherIds.has(id);
    });
    const cutoff = lessonTime(other);
    const genuineAdds = extras.filter((item) => itemTime(item) > cutoff);
    return mergeItemLists(otherList, genuineAdds);
  }
  return preferredList;
}

export function protectLesson(incoming, existing) {
  if (!incoming || !existing) return incoming;
  const next = { ...incoming };
  const deletedExpr = unionIds(incoming.deletedExpressionIds, existing.deletedExpressionIds);
  const deletedListen = unionIds(incoming.deletedListeningIds, existing.deletedListeningIds);
  next.deletedExpressionIds = [...deletedExpr];
  next.deletedListeningIds = [...deletedListen];

  const trustIncoming =
    isNewer(incoming, existing) &&
    !shouldProtectList(incoming.expressions, existing.expressions) &&
    !shouldProtectList(incoming.listeningPoints, existing.listeningPoints);

  if (trustIncoming) {
    next.expressions = filterDeleted(incoming.expressions, deletedExpr);
    next.listeningPoints = filterDeleted(incoming.listeningPoints, deletedListen);
    return next;
  }

  let expressions = Array.isArray(incoming.expressions) ? [...incoming.expressions] : [];
  let listeningPoints = Array.isArray(incoming.listeningPoints) ? [...incoming.listeningPoints] : [];
  if (shouldProtectList(incoming.expressions, existing.expressions)) {
    expressions = mergeItemLists(incoming.expressions, existing.expressions);
  }
  if (shouldProtectList(incoming.listeningPoints, existing.listeningPoints)) {
    listeningPoints = mergeItemLists(incoming.listeningPoints, existing.listeningPoints);
  }
  next.expressions = filterDeleted(expressions, deletedExpr);
  next.listeningPoints = filterDeleted(listeningPoints, deletedListen);
  return next;
}

export function mergeLessons(preferred, other) {
  if (!preferred) return other;
  if (!other) return preferred;
  const next = { ...preferred };
  const deletedExpr = unionIds(preferred.deletedExpressionIds, other.deletedExpressionIds);
  const deletedListen = unionIds(preferred.deletedListeningIds, other.deletedListeningIds);
  next.deletedExpressionIds = [...deletedExpr];
  next.deletedListeningIds = [...deletedListen];
  next.expressions = filterDeleted(chooseExpressionList(preferred, other), deletedExpr);
  next.listeningPoints = filterDeleted(chooseListeningList(preferred, other), deletedListen);
  return next;
}
