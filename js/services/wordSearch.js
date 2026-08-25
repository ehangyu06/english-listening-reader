import { normalizeExpressions, parseScriptParts } from "./parser.js?v=20260825b";

const TOKEN_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

export function splitSentences(text) {
  const src = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!src) return [];
  const pieces = [];
  let buf = "";
  for (let i = 0; i < src.length; i += 1) {
    buf += src[i];
    const ch = src[i];
    const next = src[i + 1];
    if ((ch === "." || ch === "!" || ch === "?") && (next == null || /\s/.test(next))) {
      const sentence = buf.trim();
      if (sentence) pieces.push(sentence);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) pieces.push(tail);
  return pieces;
}

export function tokenizeWords(text) {
  return [...String(text || "").matchAll(TOKEN_RE)].map((match) => match[0]);
}

export function buildWordIndex(lessons) {
  const map = new Map();
  for (const lesson of lessons || []) {
    const parts = parseScriptParts(lesson.script);
    for (const part of parts) {
      for (const sentence of splitSentences(part.text)) {
        const seen = new Set();
        for (const token of tokenizeWords(sentence)) {
          addTokenHit(map, token, seen, {
            lessonId: lesson.id,
            bookTitle: lesson.bookTitle || "",
            chapter: lesson.chapter || "",
            page: String(lesson.page || ""),
            sentence,
            partNumber: part.number,
            source: "script",
          });
        }
      }
    }
    for (const item of normalizeExpressions(lesson.expressions || [])) {
      addExpressionHits(map, lesson, item);
    }
  }
  return map;
}

function addExpressionHits(map, lesson, item) {
  const phrase = String(item.phrase || "").trim();
  const example = String(item.example || "").trim();
  const meaning = String(item.meaning || item.note || "").trim();
  const seen = new Set();
  for (const text of [phrase, example]) {
    if (!text) continue;
    for (const token of tokenizeWords(text)) {
      const key = token.toLowerCase();
      const snippet = wordInText(example, key)
        ? example
        : [phrase, meaning].filter(Boolean).join(" — ") || phrase;
      addTokenHit(map, token, seen, {
        lessonId: lesson.id,
        bookTitle: lesson.bookTitle || "",
        chapter: lesson.chapter || "",
        page: String(lesson.page || ""),
        sentence: snippet,
        source: "expression",
        itemId: item.id,
        phrase,
        fromPhrase: wordInText(phrase, key),
      });
    }
  }
}

function addTokenHit(map, token, seen, hit) {
  const key = token.toLowerCase();
  if (key.length < 2 && key !== "i" && key !== "a") return;
  if (seen.has(key)) return;
  seen.add(key);
  if (!map.has(key)) {
    map.set(key, { word: token, key, hits: [] });
  }
  map.get(key).hits.push(hit);
}

function wordInText(text, key) {
  return tokenizeWords(text).some((token) => token.toLowerCase() === key);
}

export function searchSimilarWords(index, query, limit = 12) {
  const first = String(query || "").trim().toLowerCase().split(/\s+/)[0] || "";
  const q = first.replace(/[^a-z']/g, "");
  if (q.length < 2) return [];
  const results = [];
  for (const entry of index.values()) {
    const score = scoreMatch(q, entry.key);
    if (score <= 0) continue;
    const titleBoost = entry.hits.some((hit) => hit.fromPhrase) ? 40 : 0;
    results.push({ ...entry, score: score + titleBoost });
  }
  results.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return results.slice(0, limit);
}

function scoreMatch(query, word) {
  if (word === query) return 1000;
  if (word.startsWith(query)) return 820 - Math.min(80, word.length - query.length);
  if (query.startsWith(word) && word.length >= 3) return 740 - Math.min(80, query.length - word.length);
  if (query.length >= 3 && word.includes(query)) return 640 - Math.min(80, word.length - query.length);
  if (word.length >= 4 && query.includes(word)) return 560;

  const maxDist = query.length <= 4 ? 1 : query.length <= 8 ? 2 : 3;
  if (Math.abs(word.length - query.length) > maxDist) return 0;
  const dist = levenshtein(query, word, maxDist);
  if (dist > maxDist) return 0;
  const prefix = commonPrefix(query, word);
  return 420 - dist * 50 + prefix * 8;
}

function commonPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

function levenshtein(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}
