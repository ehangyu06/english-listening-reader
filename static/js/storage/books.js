import { getSetting, setSetting } from "./db.js?v=20260825c";

const BOOK_TITLES_KEY = "bookTitles";
const BOOK_CHAPTERS_KEY = "bookChapters";

export function normalizeTitles(titles) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(titles) ? titles : []) {
    const title = String(raw || "").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(title);
  }
  return result;
}

export async function getStoredBookTitles() {
  return normalizeTitles(await getSetting(BOOK_TITLES_KEY, []));
}

export async function saveBookTitles(titles) {
  const next = normalizeTitles(titles);
  await setSetting(BOOK_TITLES_KEY, next);
  return next;
}

export async function listBookTitles(extraTitles = []) {
  return normalizeTitles([...(await getStoredBookTitles()), ...extraTitles]);
}

export async function ensureBookTitle(title) {
  const next = String(title || "").trim();
  if (!next) return "";
  const titles = await getStoredBookTitles();
  const existing = titles.find((item) => item.toLowerCase() === next.toLowerCase());
  if (existing) {
    await setSetting("currentBook", existing);
    return existing;
  }
  titles.push(next);
  await saveBookTitles(titles);
  await setSetting("currentBook", next);
  return next;
}

export async function addBookTitle(title) {
  const next = String(title || "").trim();
  if (!next) throw new Error("empty title");
  const titles = await getStoredBookTitles();
  const existing = titles.find((item) => item.toLowerCase() === next.toLowerCase());
  if (existing) {
    await setSetting("currentBook", existing);
    return { title: existing, created: false };
  }
  titles.push(next);
  await saveBookTitles(titles);
  await setSetting("currentBook", next);
  return { title: next, created: true };
}

export async function removeBookTitle(title) {
  const prev = String(title || "").trim();
  if (!prev) return await getStoredBookTitles();
  const titles = (await getStoredBookTitles()).filter((item) => item !== prev);
  await removeChaptersForBook(prev);
  return saveBookTitles(titles);
}

export async function renameStoredBookTitle(oldTitle, newTitle) {
  const prev = String(oldTitle || "").trim();
  const next = String(newTitle || "").trim();
  if (!next) throw new Error("empty title");
  const titles = await getStoredBookTitles();
  const renamed = !prev
    ? [...titles, next]
    : titles.some((item) => item === prev)
      ? titles.map((item) => (item === prev ? next : item))
      : [...titles, next];
  await saveBookTitles(renamed);
  if (prev && prev !== next) await moveChaptersToBook(prev, next);
  return normalizeTitles(renamed);
}

export async function getBookChaptersMap() {
  const stored = await getSetting(BOOK_CHAPTERS_KEY, {});
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const map = {};
  for (const [book, chapters] of Object.entries(stored)) {
    const key = String(book || "").trim();
    if (!key) continue;
    map[key] = normalizeTitles(chapters);
  }
  return map;
}

export async function saveBookChaptersMap(map) {
  const clean = {};
  for (const [book, chapters] of Object.entries(map || {})) {
    const key = String(book || "").trim();
    if (!key) continue;
    clean[key] = normalizeTitles(chapters);
  }
  await setSetting(BOOK_CHAPTERS_KEY, clean);
  return clean;
}

export async function getChaptersForBook(bookTitle, extraChapters = []) {
  const book = String(bookTitle || "").trim();
  if (!book) return normalizeTitles(extraChapters);
  const map = await getBookChaptersMap();
  return normalizeTitles([...(map[book] || []), ...extraChapters]);
}

export async function addChapter(bookTitle, chapter) {
  const book = String(bookTitle || "").trim();
  const next = String(chapter || "").trim();
  if (!book) throw new Error("empty book");
  if (!next) throw new Error("empty chapter");
  const map = await getBookChaptersMap();
  const list = map[book] || [];
  const existing = list.find((item) => item.toLowerCase() === next.toLowerCase());
  if (existing) return { chapter: existing, created: false };
  map[book] = [...list, next];
  await saveBookChaptersMap(map);
  return { chapter: next, created: true };
}

export async function ensureChapter(bookTitle, chapter) {
  const book = String(bookTitle || "").trim();
  const next = String(chapter || "").trim();
  if (!book || !next) return next;
  const result = await addChapter(book, next);
  return result.chapter;
}

export async function removeChapter(bookTitle, chapter) {
  const book = String(bookTitle || "").trim();
  const prev = String(chapter || "").trim();
  if (!book || !prev) return [];
  const map = await getBookChaptersMap();
  map[book] = (map[book] || []).filter((item) => item !== prev);
  if (!map[book].length) delete map[book];
  await saveBookChaptersMap(map);
  return map[book] || [];
}

export async function renameChapterInStore(bookTitle, oldChapter, newChapter) {
  const book = String(bookTitle || "").trim();
  const prev = String(oldChapter || "").trim();
  const next = String(newChapter || "").trim();
  if (!book || !next) throw new Error("empty chapter");
  const map = await getBookChaptersMap();
  const list = map[book] || [];
  if (!prev) {
    map[book] = [...list, next];
  } else if (!list.some((item) => item === prev)) {
    map[book] = [...list, next];
  } else {
    map[book] = list.map((item) => (item === prev ? next : item));
  }
  await saveBookChaptersMap(map);
  return next;
}

async function removeChaptersForBook(bookTitle) {
  const book = String(bookTitle || "").trim();
  if (!book) return;
  const map = await getBookChaptersMap();
  if (!(book in map)) return;
  delete map[book];
  await saveBookChaptersMap(map);
}

async function moveChaptersToBook(oldTitle, newTitle) {
  const prev = String(oldTitle || "").trim();
  const next = String(newTitle || "").trim();
  if (!prev || !next || prev === next) return;
  const map = await getBookChaptersMap();
  const moved = normalizeTitles([...(map[next] || []), ...(map[prev] || [])]);
  delete map[prev];
  if (moved.length) map[next] = moved;
  else delete map[next];
  await saveBookChaptersMap(map);
}
