import { runStore, getSetting, setSetting } from "./db.js?v=20260825c";
import { naturalCompare, toast } from "../utils.js?v=20260816p";
import { deleteAudio } from "./audio.js?v=20260825c";
import { deleteImage } from "./images.js?v=20260825c";
import { remoteDeleteLesson, remotePutLesson } from "./remote.js?v=20260825c";
import { ensureBookTitle, ensureChapter, listBookTitles, removeBookTitle, renameChapterInStore, renameStoredBookTitle } from "./books.js?v=20260816w";

function cloneForDb(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeLesson(lesson) {
  if (!lesson) return lesson;
  if (lesson.literalTranslationKo == null) lesson.literalTranslationKo = "";
  if (lesson.pageInterpretationKo == null) lesson.pageInterpretationKo = "";
  if (!Array.isArray(lesson.audioTracks)) lesson.audioTracks = [];
  lesson.imageIds = getLessonImageIds(lesson);
  lesson.imageId = lesson.imageIds[0] || "";
  return lesson;
}

export const MAX_PAGE_PHOTOS = 10;

export function getLessonImageIds(lesson) {
  if (!lesson) return [];
  const ids = [];
  const seen = new Set();
  const source = [...(Array.isArray(lesson.imageIds) ? lesson.imageIds : []), lesson.imageId];
  for (const raw of source) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_PAGE_PHOTOS) break;
  }
  return ids;
}

export function getFullAudioTrack(lesson) {
  return (lesson?.audioTracks || []).find((track) => track.type === "full") || null;
}

export function hasAudio(lesson) {
  return Boolean(getFullAudioTrack(lesson)?.audioId);
}

export async function getAllLessons() {
  const lessons = (await runStore("lessons", "readonly", (store) => store.getAll())) || [];
  return lessons
    .map(normalizeLesson)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function getLesson(id) {
  return normalizeLesson(await runStore("lessons", "readonly", (store) => store.get(id)));
}

export async function saveLesson(lesson, { silent = false } = {}) {
  try {
    const clean = cloneForDb(normalizeLesson({ ...lesson }));
    await runStore("lessons", "readwrite", (store) => store.put(clean));
    try {
      await remotePutLesson(clean);
    } catch (error) {
      console.warn(error);
    }
    try {
      await ensureBookTitle(lesson.bookTitle);
      await ensureChapter(lesson.bookTitle, lesson.chapter);
    } catch (error) {
      console.warn(error);
    }
    return lesson;
  } catch (error) {
    console.error(error);
    if (!silent) {
      toast("저장하지 못했습니다. 아이패드에서는 다른 Safari 탭을 닫고 다시 시도해 주세요.");
    }
    throw error;
  }
}

export async function deleteLesson(id) {
  const lesson = await getLesson(id);
  for (const imageId of getLessonImageIds(lesson)) {
    try {
      await deleteImage(imageId);
    } catch (error) {
      console.warn(error);
    }
  }
  for (const track of lesson?.audioTracks || []) {
    if (track.audioId) {
      try {
        await deleteAudio(track.audioId);
      } catch (error) {
        console.warn(error);
      }
    }
  }
  await runStore("lessons", "readwrite", (store) => store.delete(id));
  try {
    await remoteDeleteLesson(id);
  } catch (error) {
    console.warn(error);
  }
}

export async function deleteBook(bookTitle) {
  const lessons = await getLessonsByBook(bookTitle);
  for (const lesson of lessons) {
    await deleteLesson(lesson.id);
  }
  await removeBookTitle(bookTitle);
  const remainingTitles = await listBookTitles((await getAllLessons()).map((lesson) => lesson.bookTitle));
  const current = await getSetting("currentBook", "");
  if (current === bookTitle) {
    await setSetting("currentBook", remainingTitles[0] || "");
  }
  return lessons.length;
}

export async function getLessonsByBook(bookTitle) {
  const all = await getAllLessons();
  return all
    .filter((lesson) => lesson.bookTitle === bookTitle)
    .sort((a, b) => {
      const chapter = naturalCompare(a.chapter, b.chapter);
      if (chapter !== 0) return chapter;
      return naturalCompare(a.page, b.page);
    });
}

export function groupBooks(lessons, extraTitles = []) {
  const map = new Map();
  for (const lesson of lessons) {
    const title = lesson.bookTitle || "제목 없음";
    if (!map.has(title)) {
      map.set(title, {
        title,
        count: 0,
        completed: 0,
        updatedAt: lesson.updatedAt,
      });
    }
    const book = map.get(title);
    book.count += 1;
    if (lesson.completed) book.completed += 1;
    if (String(lesson.updatedAt) > String(book.updatedAt)) book.updatedAt = lesson.updatedAt;
  }
  for (const raw of extraTitles) {
    const title = String(raw || "").trim();
    if (!title || map.has(title)) continue;
    map.set(title, {
      title,
      count: 0,
      completed: 0,
      updatedAt: "",
    });
  }
  return [...map.values()].sort((a, b) => {
    const aTime = String(a.updatedAt || "");
    const bTime = String(b.updatedAt || "");
    if (aTime && bTime) return bTime.localeCompare(aTime);
    if (aTime) return -1;
    if (bTime) return 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export function groupByChapter(lessons, extraChapters = []) {
  const map = new Map();
  for (const lesson of lessons) {
    const chapter = lesson.chapter || "기타";
    if (!map.has(chapter)) map.set(chapter, []);
    map.get(chapter).push(lesson);
  }
  for (const raw of extraChapters) {
    const chapter = String(raw || "").trim();
    if (!chapter || map.has(chapter)) continue;
    map.set(chapter, []);
  }
  return [...map.entries()].sort((a, b) => naturalCompare(a[0], b[0]));
}

export async function renameChapter(bookTitle, oldChapter, newChapter) {
  const book = String(bookTitle || "").trim();
  const next = String(newChapter || "").trim();
  const prev = String(oldChapter || "").trim();
  if (!book) throw new Error("empty book");
  if (!next) throw new Error("empty chapter");
  if (next === prev) return next;
  const lessons = (await getLessonsByBook(book)).filter(
    (lesson) => String(lesson.chapter || "").trim() === prev
  );
  const now = new Date().toISOString();
  for (const lesson of lessons) {
    lesson.chapter = next;
    lesson.updatedAt = now;
    await saveLesson(lesson);
  }
  await renameChapterInStore(book, prev, next);
  return next;
}

export async function updateLessonMeta(id, { bookTitle, chapter, page }) {
  const lesson = await getLesson(id);
  if (!lesson) throw new Error("missing lesson");
  const nextTitle = bookTitle == null ? lesson.bookTitle : String(bookTitle).trim();
  const nextChapter = chapter == null ? lesson.chapter : String(chapter).trim();
  const nextPage = page == null ? lesson.page : String(page).trim();
  if (!nextTitle || !nextChapter || !nextPage) throw new Error("empty meta");
  lesson.bookTitle = nextTitle;
  lesson.chapter = nextChapter;
  lesson.page = nextPage;
  lesson.updatedAt = new Date().toISOString();
  await saveLesson(lesson);
  return lesson;
}

export async function renameBook(oldTitle, newTitle) {
  const next = String(newTitle || "").trim();
  const prev = String(oldTitle || "").trim();
  if (!next) throw new Error("empty title");
  if (next === prev) return prev;
  const lessons = (await getAllLessons()).filter(
    (lesson) => String(lesson.bookTitle || "").trim() === prev
  );
  const now = new Date().toISOString();
  for (const lesson of lessons) {
    lesson.bookTitle = next;
    lesson.updatedAt = now;
    await saveLesson(lesson);
  }
  await renameStoredBookTitle(prev, next);
  const current = await getSetting("currentBook", "");
  if (current === prev) await setSetting("currentBook", next);
  return next;
}

export function getNeighbors(lessons, currentId) {
  const index = lessons.findIndex((lesson) => lesson.id === currentId);
  return {
    prev: index > 0 ? lessons[index - 1] : null,
    next: index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null,
  };
}
