import { SAMPLE_ID } from "../data/sample.js?v=20260816w";
import { runStore, getSetting, setSetting } from "./db.js?v=20260825c";
import { getAllLessons, saveLesson, normalizeLesson } from "./lessons.js?v=20260825c";
import {
  remoteGetState,
  remotePutLesson,
  remotePutSetting,
  remoteBlobExists,
  remotePutBlob,
} from "./remote.js?v=20260825c";

function newer(a, b) {
  return String(a?.updatedAt || "") >= String(b?.updatedAt || "");
}

async function syncBlob(kind, id) {
  if (!id) return;
  const local = await runStore(kind, "readonly", (store) => store.get(id));
  if (!local?.blob) return;
  const exists = await remoteBlobExists(kind, id);
  if (!exists) await remotePutBlob(kind, local);
}

export async function syncLibrary() {
  let remote;
  try {
    remote = await remoteGetState();
  } catch (error) {
    console.warn("Mac 공유 저장소에 연결하지 못했습니다.", error);
    return;
  }

  const localLessons = await getAllLessons();
  const merged = new Map();
  for (const lesson of remote.lessons || []) {
    if (lesson?.id && lesson.id !== SAMPLE_ID) merged.set(lesson.id, normalizeLesson(lesson));
  }
  for (const lesson of localLessons) {
    if (lesson.id === SAMPLE_ID) continue;
    const current = merged.get(lesson.id);
    if (!current || newer(lesson, current)) merged.set(lesson.id, lesson);
  }

  for (const lesson of merged.values()) {
    await saveLesson(lesson, { silent: true });
    try {
      await remotePutLesson(lesson);
    } catch (error) {
      console.warn(error);
    }
    try {
      await syncBlob("images", lesson.imageId);
      for (const imageId of lesson.imageIds || []) {
        await syncBlob("images", imageId);
      }
      for (const track of lesson.audioTracks || []) {
        await syncBlob("audio", track.audioId);
      }
    } catch (error) {
      console.warn(error);
    }
  }

  const remoteSettings = remote.settings || {};
  for (const [key, value] of Object.entries(remoteSettings)) {
    const local = await getSetting(key, undefined);
    if (local === undefined || local === null) {
      await runStore("settings", "readwrite", (store) => store.put({ key, value }));
    }
  }

  const books = [...merged.values()].map((lesson) => lesson.bookTitle).filter(Boolean);
  const preferred = books.find((title) => title !== "Willow Lane") || books[0] || "";
  const current = (await getSetting("currentBook", "")) || remoteSettings.currentBook || "";
  if (preferred && (!current || (current === "Willow Lane" && preferred !== "Willow Lane"))) {
    await setSetting("currentBook", preferred);
  } else if (current) {
    try {
      await remotePutSetting("currentBook", current);
    } catch (error) {
      console.warn(error);
    }
  }
}
