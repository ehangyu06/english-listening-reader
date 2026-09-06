import { normalizeExpressions, parseScriptParts } from "./parser.js?v=20260825b";

const TOKEN_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "onto",
  "to",
  "with",
  "about",
  "over",
  "under",
  "out",
  "up",
  "down",
  "than",
  "then",
  "so",
  "not",
  "no",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "he",
  "she",
  "we",
  "you",
  "they",
  "them",
  "me",
  "him",
  "us",
  "my",
  "your",
  "his",
  "her",
  "our",
  "their",
  "who",
  "whom",
  "which",
  "what",
  "when",
  "where",
  "why",
  "how",
  "be",
  "am",
  "is",
  "are",
  "was",
  "were",
  "been",
  "being",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "get",
  "got",
]);

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
  const phrases = [];
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
      const phrase = String(item.phrase || "").trim();
      if (phrase) {
        phrases.push({
          phrase,
          key: normalizePhrase(phrase),
          tokens: tokenizeWords(phrase).map((token) => token.toLowerCase()),
          meaning: String(item.meaning || item.note || "").trim(),
          lessonId: lesson.id,
          bookTitle: lesson.bookTitle || "",
          chapter: lesson.chapter || "",
          page: String(lesson.page || ""),
          itemId: item.id,
        });
      }
      addExpressionHits(map, lesson, item);
    }
  }
  map.phrases = phrases;
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

function normalizePhrase(text) {
  return tokenizeWords(text)
    .map((token) => token.toLowerCase())
    .join(" ");
}

function significantTokens(tokens) {
  const cleaned = tokens.map((token) => token.toLowerCase()).filter((token) => token.length >= 2);
  const useful = cleaned.filter((token) => !STOP_WORDS.has(token));
  return useful.length ? useful : cleaned;
}

function sortHits(hits) {
  return [...(hits || [])].sort((a, b) => {
    const aExpr = a.source === "expression" ? 1 : 0;
    const bExpr = b.source === "expression" ? 1 : 0;
    if (aExpr !== bExpr) return bExpr - aExpr;
    const aPhrase = a.fromPhrase ? 1 : 0;
    const bPhrase = b.fromPhrase ? 1 : 0;
    if (aPhrase !== bPhrase) return bPhrase - aPhrase;
    return 0;
  });
}

function phraseScore(entry, queryKey, queryTokens) {
  if (!entry.key) return 0;
  if (entry.key === queryKey) return 5000;
  if (queryKey && entry.key.includes(queryKey)) return 4600 - Math.min(200, entry.key.length - queryKey.length);
  if (queryKey && queryKey.includes(entry.key) && entry.tokens.length >= 2) {
    return 4400 - Math.min(200, queryKey.length - entry.key.length);
  }
  if (!queryTokens.length) return 0;
  const hitCount = queryTokens.filter((token) => entry.tokens.includes(token)).length;
  if (!hitCount) return 0;
  if (hitCount === queryTokens.length) return 4800 + hitCount * 10;
  if (hitCount >= Math.max(1, queryTokens.length - 1) && hitCount >= 2) return 4200 + hitCount * 10;
  if (hitCount >= 2) return 3800 + hitCount * 10;
  return 0;
}

function collectPhraseMatches(index, query, queryTokens) {
  const phrases = index.phrases || [];
  const queryKey = normalizePhrase(query);
  const results = [];
  for (const entry of phrases) {
    const score = phraseScore(entry, queryKey, queryTokens);
    if (score <= 0) continue;
    const meaning = entry.meaning;
    results.push({
      key: `phrase:${entry.itemId}`,
      word: entry.phrase,
      score,
      kind: "phrase",
      hits: [
        {
          lessonId: entry.lessonId,
          bookTitle: entry.bookTitle,
          chapter: entry.chapter,
          page: entry.page,
          sentence: meaning ? `${entry.phrase} — ${meaning}` : entry.phrase,
          source: "expression",
          itemId: entry.itemId,
          phrase: entry.phrase,
          fromPhrase: true,
        },
      ],
    });
  }
  results.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  return results;
}

function collectWordMatches(index, token, usedKeys) {
  const results = [];
  for (const entry of index.values()) {
    if (!entry?.key || usedKeys.has(entry.key)) continue;
    const score = scoreMatch(token, entry.key);
    if (score <= 0) continue;
    const expressionBoost = entry.hits.some((hit) => hit.source === "expression") ? 80 : 0;
    const titleBoost = entry.hits.some((hit) => hit.fromPhrase) ? 40 : 0;
    const exactBoost = entry.key === token ? 200 : 0;
    results.push({
      ...entry,
      hits: sortHits(entry.hits),
      score: score + expressionBoost + titleBoost + exactBoost,
      kind: "word",
    });
  }
  results.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return results;
}

export function searchSimilarWords(index, query, limit = 12) {
  const raw = String(query || "").trim();
  if (!raw) return [];
  const tokens = tokenizeWords(raw);
  const queryTokens = significantTokens(tokens);
  if (!queryTokens.length) return [];

  const usedKeys = new Set();
  const results = [];

  for (const phrase of collectPhraseMatches(index, raw, queryTokens)) {
    if (usedKeys.has(phrase.key)) continue;
    usedKeys.add(phrase.key);
    results.push(phrase);
    if (results.length >= limit) return results;
  }

  for (const token of queryTokens) {
    const matches = collectWordMatches(index, token, usedKeys);
    let added = 0;
    for (const entry of matches) {
      if (usedKeys.has(entry.key)) continue;
      usedKeys.add(entry.key);
      results.push(entry);
      added += 1;
      if (results.length >= limit) return results;
      if (entry.key === token || added >= 3) break;
    }
  }

  return results;
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
