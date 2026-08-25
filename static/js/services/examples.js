import { parseScriptParts } from "./parser.js?v=20260818h";
import { splitSentences } from "./wordSearch.js?v=20260818k";

export function googleExampleUrl(phrase) {
  const q = `${String(phrase || "").trim()} example sentence 예문`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function findLocalExamples(lessons, phrase, limit = 4) {
  const needles = phraseNeedles(phrase);
  if (!needles.length) return [];
  const out = [];
  const seen = new Set();
  for (const lesson of lessons || []) {
    const parts = parseScriptParts(lesson.script);
    for (const part of parts) {
      for (const sentence of splitSentences(part.text)) {
        const compact = sentence.replace(/\s+/g, " ").trim();
        if (!compact || seen.has(compact.toLowerCase())) continue;
        if (!needles.some((needle) => sentenceHasPhrase(compact, needle))) continue;
        seen.add(compact.toLowerCase());
        out.push({
          en: compact,
          ko: "",
          source: `${lesson.bookTitle || ""} · ${lesson.chapter || ""} · Page ${lesson.page || ""}`.trim(),
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export async function fetchExamplePairs(phrase, lessons) {
  const local = findLocalExamples(lessons, phrase, 3);
  let web = [];
  try {
    web = await fetchTatoeba(phrase);
  } catch {
    web = [];
  }
  if (!web.length) {
    try {
      web = await fetchDictionaryExamples(phrase);
    } catch {
      web = [];
    }
  }
  const merged = dedupePairs([...local, ...web]).slice(0, 5);
  await Promise.all(
    merged.map(async (row) => {
      if (row.ko) return;
      row.ko = await translateKo(row.en);
    })
  );
  return merged;
}

function phraseNeedles(phrase) {
  const raw = String(phrase || "").trim();
  if (!raw) return [];
  const cleaned = raw.replace(/~/g, " ").replace(/\s+/g, " ").trim();
  const parts = raw
    .split("~")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2);
  const needles = [];
  if (cleaned.length >= 2) needles.push(cleaned);
  for (const part of parts) {
    if (!needles.includes(part)) needles.push(part);
  }
  return needles;
}

function sentenceHasPhrase(sentence, phrase) {
  const hay = sentence.toLowerCase();
  const needle = phrase.toLowerCase();
  if (needle.includes(" ")) return hay.includes(needle);
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
  return re.test(sentence);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupePairs(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = String(row.en || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function fetchTatoeba(phrase) {
  const q = String(phrase || "").trim();
  if (!q) return [];
  const url = `https://tatoeba.org/eng/api_v0/search?from=eng&to=kor&query=${encodeURIComponent(q)}&orphans=no&unapproved=no`;
  const data = await fetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  const out = [];
  for (const row of results) {
    const en = String(row?.text || "").trim();
    if (!en) continue;
    const ko = firstKorean(row);
    out.push({ en, ko, source: "Tatoeba" });
    if (out.length >= 5) break;
  }
  return out;
}

function firstKorean(row) {
  const groups = row?.translations;
  const lists = Array.isArray(groups) ? groups.flat(2) : [];
  for (const item of lists) {
    const lang = String(item?.lang || item?.language || "").toLowerCase();
    const text = String(item?.text || "").trim();
    if (!text) continue;
    if (lang === "kor" || lang === "ko" || /[\uac00-\ud7a3]/.test(text)) return text;
  }
  return "";
}

async function fetchDictionaryExamples(phrase) {
  const word = String(phrase || "").trim();
  if (!word || /\s/.test(word)) return [];
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const data = await fetchJson(url);
  const entries = Array.isArray(data) ? data : [];
  const out = [];
  for (const entry of entries) {
    for (const meaning of entry.meanings || []) {
      for (const def of meaning.definitions || []) {
        const en = String(def.example || "").trim();
        if (!en) continue;
        out.push({ en, ko: "", source: "사전 예문" });
        if (out.length >= 4) return out;
      }
    }
  }
  return out;
}

async function translateKo(text) {
  const q = String(text || "").trim();
  if (!q) return "";
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q.slice(0, 500))}&langpair=en|ko`;
    const data = await fetchJson(url);
    const ko = String(data?.responseData?.translatedText || "").trim();
    if (!ko || ko.toLowerCase() === q.toLowerCase() || /mymemory warning/i.test(ko)) return "";
    return ko;
  } catch {
    return "";
  }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("fetch failed");
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
