const LIST_KEY = "reviewListState";
const JUMP_KEY = "reviewJump";

export function isFromReview() {
  return /(?:\?|&)from=review(?:&|$)/.test(location.hash.replace(/^#/, ""));
}

export function saveReviewListState(state) {
  try {
    sessionStorage.setItem(LIST_KEY, JSON.stringify(state || {}));
  } catch {
    /* ignore */
  }
}

export function loadReviewListState() {
  try {
    const raw = sessionStorage.getItem(LIST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveReviewJump(jump) {
  try {
    sessionStorage.setItem(JUMP_KEY, JSON.stringify(jump || {}));
  } catch {
    /* ignore */
  }
}

export function readReviewJump(lessonId) {
  try {
    const jump = JSON.parse(sessionStorage.getItem(JUMP_KEY) || "null");
    if (!jump || jump.lessonId !== lessonId) return null;
    return jump;
  } catch {
    return null;
  }
}
