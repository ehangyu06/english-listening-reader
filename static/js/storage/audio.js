import { runStore } from "./db.js?v=20260825c";
import { remoteDeleteBlob, remoteGetBlob, remotePutBlob } from "./remote.js?v=20260825c";

export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

export const AUDIO_ACCEPT = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/*",
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".ogg",
  ".webm",
  ".caf",
].join(",");

export function isIosDevice() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1;
}

export function audioFileInputAttrs() {
  // iOS Files / Google Drive often omit audio UTIs. accept="audio/*" then hides
  // iCloud voice memos and greys out Drive recordings.
  if (isIosDevice()) return "";
  return ` accept="${AUDIO_ACCEPT}"`;
}

export function isAudioFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (type.startsWith("audio/")) return true;
  if (type === "video/mp4" && name.endsWith(".m4a")) return true;
  return /\.(mp3|m4a|wav|aac|webm|ogg|caf)$/.test(name);
}

export async function saveAudio(record) {
  try {
    await runStore("audio", "readwrite", (store) => store.put(record));
    try {
      await remotePutBlob("audio", record);
    } catch (error) {
      console.warn(error);
    }
    return record.id;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getAudio(id) {
  if (!id) return null;
  const local = await runStore("audio", "readonly", (store) => store.get(id));
  if (local) return local;
  try {
    const remote = await remoteGetBlob("audio", id);
    if (remote) {
      await runStore("audio", "readwrite", (store) => store.put(remote));
      return remote;
    }
  } catch (error) {
    console.warn(error);
  }
  return null;
}

export async function deleteAudio(id) {
  if (!id) return;
  await runStore("audio", "readwrite", (store) => store.delete(id));
  try {
    await remoteDeleteBlob("audio", id);
  } catch (error) {
    console.warn(error);
  }
}

export function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.playsInline = true;
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration === Infinity) {
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          const duration = audio.duration;
          audio.currentTime = 0;
          done(duration);
        };
        return;
      }
      done(audio.duration);
    };
    audio.onerror = () => done(0);
    window.setTimeout(() => {
      if (!finished) done(audio.duration);
    }, 2500);
    audio.src = url;
  });
}
