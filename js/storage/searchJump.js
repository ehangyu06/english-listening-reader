const JUMP_KEY = "searchJump";
const QUERY_KEY = "searchQueryState";

export function isFromSearch() {
  return /(?:\?|&)from=search(?:&|$)/.test(location.hash.replace(/^#/, ""));
}

export function saveSearchJump(jump) {
  try {
    sessionStorage.setItem(JUMP_KEY, JSON.stringify(jump || {}));
  } catch {
    /* ignore */
  }
}

export function readSearchJump(lessonId) {
  try {
    const jump = JSON.parse(sessionStorage.getItem(JUMP_KEY) || "null");
    if (!jump || jump.lessonId !== lessonId) return null;
    return jump;
  } catch {
    return null;
  }
}

export function saveSearchQueryState(state) {
  try {
    sessionStorage.setItem(QUERY_KEY, JSON.stringify(state || {}));
  } catch {
    /* ignore */
  }
}

export function loadSearchQueryState() {
  try {
    const raw = sessionStorage.getItem(QUERY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
