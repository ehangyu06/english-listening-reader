// Expression sync rules:
// 1) deletedExpressionIds are remembered (union) and never resurrected.
// 2) Expressions are merged by id from both sides so new adds are kept.
// 3) Legacy cleanup without tombstones: only when the NEWER side is larger and
//    the older side is a subset, drop old extras that look like resurrected deletes.
//    (Do NOT drop extras just because a newer smaller edit is missing them.)

function itemKey(item) {
  if (!item || typeof item !== "object") return "";
  const id = String(item.id || "").trim();
  if (id) return id;
  const phrase = String(item.phrase || "").trim().toLowerCase();
  return phrase ? `phrase:${phrase}` : "";
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

export function rememberDeletedIds(lesson, ids, field = "deletedExpressionIds") {
  if (!lesson || !ids?.length) return lesson;
  lesson[field] = [...unionIds(lesson[field], ids)];
  return lesson;
}

export function forgetDeletedIds(lesson, ids, field = "deletedExpressionIds") {
  if (!lesson || !ids?.length) return lesson;
  const remove = new Set(asIdList(ids));
  lesson[field] = asIdList(lesson[field]).filter((id) => !remove.has(id));
  return lesson;
}

// largerList contains smallerList ids; drop larger-only items unless newly created
// after the smaller side's updatedAt (genuine adds from the other device).
function dropOldExtras(merged, largerList, smallerList, smallerLesson) {
  if (!smallerList.length || largerList.length <= smallerList.length) return merged;
  if (!isIdSubset(smallerList, largerList)) return merged;
  const keepIds = idSet(smallerList);
  const cutoff = lessonTime(smallerLesson);
  return merged.filter((item) => {
    const id = String(item?.id || "").trim();
    if (id && keepIds.has(id)) return true;
    return itemTime(item) > cutoff;
  });
}

function mergeField(preferred, other, field) {
  const preferredList = Array.isArray(preferred?.[field]) ? preferred[field] : [];
  const otherList = Array.isArray(other?.[field]) ? other[field] : [];
  let merged = mergeItemLists(preferredList, otherList);

  // Only strip "resurrected deletes" when the preferred (newer) side is the larger one.
  // If the newer side is smaller, missing items from the older side are treated as
  // not-yet-synced adds and kept (unless tombstoned).
  if (preferredList.length > otherList.length && isIdSubset(otherList, preferredList)) {
    merged = dropOldExtras(merged, preferredList, otherList, other);
  }
  return merged;
}

export function protectLesson(incoming, existing) {
  if (!incoming || !existing) return incoming;
  const next = { ...incoming };
  const deletedExpr = unionIds(incoming.deletedExpressionIds, existing.deletedExpressionIds);
  const deletedListen = unionIds(incoming.deletedListeningIds, existing.deletedListeningIds);
  next.deletedExpressionIds = [...deletedExpr];
  next.deletedListeningIds = [...deletedListen];

  const incomingList = Array.isArray(incoming.expressions) ? incoming.expressions : [];
  const existingList = Array.isArray(existing.expressions) ? existing.expressions : [];
  let expressions = mergeItemLists(incomingList, existingList);
  if (incomingList.length > existingList.length && isIdSubset(existingList, incomingList)) {
    expressions = dropOldExtras(expressions, incomingList, existingList, existing);
  }

  const incomingListen = Array.isArray(incoming.listeningPoints) ? incoming.listeningPoints : [];
  const existingListen = Array.isArray(existing.listeningPoints) ? existing.listeningPoints : [];
  let listeningPoints = mergeItemLists(incomingListen, existingListen);
  if (incomingListen.length > existingListen.length && isIdSubset(existingListen, incomingListen)) {
    listeningPoints = dropOldExtras(listeningPoints, incomingListen, existingListen, existing);
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
  next.expressions = filterDeleted(mergeField(preferred, other, "expressions"), deletedExpr);
  next.listeningPoints = filterDeleted(mergeField(preferred, other, "listeningPoints"), deletedListen);
  return next;
}

export function shouldProtectList() {
  return false;
}
