import { escapeHtml } from "../utils.js?v=20260816p";

const OPTIONAL = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "as",
  "it",
  "is",
  "be",
  "by",
  "with",
  "from",
  "this",
  "that",
  "some",
  "any",
]);

const IRREGULAR = {
  have: "have|has|had|having",
  do: "do|does|did|done|doing",
  go: "go|goes|went|gone|going",
  come: "come|comes|came|coming",
  take: "take|takes|took|taken|taking",
  make: "make|makes|made|making",
  get: "get|gets|got|gotten|getting",
  keep: "keep|keeps|kept|keeping",
  feel: "feel|feels|felt|feeling",
  hit: "hit|hits|hitting",
};

export function markedText(text, phrase, wholeWord = false) {
  const raw = String(text || "");
  const ranges = findHighlightRanges(raw, phrase, wholeWord);
  return wrapRanges(raw, ranges).replace(/\n/g, "<br>");
}

export function markEscapedText(escapedText, phrase, wholeWord = false) {
  const needles = phraseNeedles(phrase).map((needle) => escapeHtml(needle));
  const lower = escapedText.toLowerCase();
  let chosen = "";
  for (const needle of needles) {
    if (needle && lower.includes(needle.toLowerCase()) && needle.length > chosen.length) {
      chosen = needle;
    }
  }
  if (!chosen) return escapedText;
  const pattern = wholeWord ? `\\b${escapeRegExp(chosen)}\\b` : escapeRegExp(chosen);
  const re = new RegExp(pattern, "gi");
  return escapedText.replace(re, (match) => `<mark class="review-mark">${match}</mark>`);
}

function findHighlightRanges(text, phrase, wholeWord) {
  const exact = exactRanges(text, phrase, wholeWord);
  if (exact.length) return exact;
  return flexibleSpans(text, phrase);
}

function exactRanges(text, phrase, wholeWord) {
  const needles = phraseNeedles(phrase);
  const hay = normalizeApostrophe(text);
  let chosen = "";
  for (const needle of needles) {
    const n = normalizeApostrophe(needle);
    if (n && hay.toLowerCase().includes(n.toLowerCase()) && n.length > chosen.length) {
      chosen = n;
    }
  }
  if (!chosen) return [];
  const pattern = wholeWord ? `\\b${escapeRegExp(chosen)}\\b` : escapeRegExp(chosen);
  return matchRanges(hay, new RegExp(pattern, "gi"));
}

function flexibleSpans(text, phrase) {
  const hay = normalizeApostrophe(text);
  const required = tokenize(phrase).filter((token) => !OPTIONAL.has(token.toLowerCase()));
  if (required.length < 2) return [];
  const patterns = required.map((token) => new RegExp(`\\b${tokenPattern(token)}\\b`, "ig"));
  const ranges = [];
  let startSearch = 0;
  while (startSearch < hay.length) {
    const first = patterns[0];
    first.lastIndex = startSearch;
    const head = first.exec(hay);
    if (!head) break;
    let from = head.index + head[0].length;
    let end = from;
    let ok = true;
    for (let i = 1; i < patterns.length; i += 1) {
      const re = patterns[i];
      re.lastIndex = from;
      const next = re.exec(hay);
      if (!next || next.index - from > 32) {
        ok = false;
        break;
      }
      end = next.index + next[0].length;
      from = end;
    }
    if (ok) {
      ranges.push({ start: head.index, end });
      startSearch = end;
    } else {
      startSearch = head.index + Math.max(1, head[0].length);
    }
  }
  return ranges;
}

function matchRanges(text, re) {
  const ranges = [];
  const hay = text;
  let match;
  while ((match = re.exec(hay))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (!match[0].length) re.lastIndex += 1;
  }
  return ranges;
}

function wrapRanges(text, ranges) {
  if (!ranges.length) return escapeHtml(text);
  const merged = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  let out = "";
  let cursor = 0;
  for (const range of merged) {
    out += escapeHtml(text.slice(cursor, range.start));
    out += `<mark class="review-mark">${escapeHtml(text.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }
  return out + escapeHtml(text.slice(cursor));
}

function phraseNeedles(phrase) {
  const raw = normalizeApostrophe(String(phrase || "")).trim();
  if (!raw) return [];
  const cleaned = raw.replace(/~/g, " ").replace(/\s+/g, " ").trim();
  const parts = raw
    .split("~")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 3);
  const needles = [];
  if (cleaned.length >= 2) needles.push(cleaned);
  for (const part of parts) {
    if (!needles.includes(part)) needles.push(part);
  }
  return needles;
}

function tokenize(phrase) {
  return normalizeApostrophe(String(phrase || ""))
    .replace(/~/g, " ")
    .split(/[^A-Za-z']+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenPattern(token) {
  const placeholder = placeholderPattern(token);
  if (placeholder) return placeholder;
  const lower = token.toLowerCase();
  if (IRREGULAR[lower]) return `(?:${IRREGULAR[lower]})`;
  const stem = stemWord(lower);
  if (stem.length >= 3 && stem !== lower) return `${escapeRegExp(stem)}[A-Za-z']*`;
  return `${escapeRegExp(lower)}(?:s|es|ed|ing|d)?`;
}

function placeholderPattern(token) {
  const lower = normalizeApostrophe(token).toLowerCase();
  if (lower === "one's" || lower === "someone's" || lower === "somebody's" || lower === "sb's") {
    return "(?:one's|someone's|somebody's|my|your|his|her|its|our|their)";
  }
  if (lower === "someone" || lower === "somebody" || lower === "sb") {
    return "(?:someone|somebody|sb|me|you|him|her|them|us|one)";
  }
  if (lower === "something" || lower === "sth") {
    return "(?:something|sth|[A-Za-z']+)";
  }
  return "";
}

function stemWord(word) {
  if (word.length <= 4) return word;
  if (word.endsWith("ing")) return word.slice(0, -3);
  if (word.endsWith("ied")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ed")) return word.slice(0, -2);
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("es")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function normalizeApostrophe(value) {
  return String(value || "").replace(/[\u2018\u2019\u02bc]/g, "'");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
