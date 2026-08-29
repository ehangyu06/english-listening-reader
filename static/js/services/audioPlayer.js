let audioEl = null;
let objectUrl = "";
let nowPlaying = null;
const listeners = new Set();

export function getAudioElement() {
  return audioEl;
}

export function getNowPlaying() {
  return nowPlaying;
}

export function onNowPlayingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setNowPlaying(info) {
  nowPlaying = info || null;
  syncMediaSession();
  notify();
}

export function clearNowPlaying() {
  nowPlaying = null;
  syncMediaSession();
  notify();
}

export function notifyNowPlaying() {
  notify();
}

export function isLessonPlaying(lessonId) {
  return Boolean(nowPlaying?.kind === "lesson" && nowPlaying.lessonId === lessonId && audioEl);
}

export function stopAudio() {
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.removeAttribute("src");
      audioEl.load();
    } catch {
      /* ignore */
    }
    audioEl = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }
  nowPlaying = null;
  syncMediaSession();
  notify();
}

export function attachAudio(blob) {
  stopAudio();
  objectUrl = URL.createObjectURL(blob);
  audioEl = new Audio();
  audioEl.preload = "metadata";
  audioEl.playsInline = true;
  audioEl.setAttribute("playsinline", "true");
  audioEl.setAttribute("webkit-playsinline", "true");
  audioEl.src = objectUrl;
  wireAudio(audioEl);
  return audioEl;
}

export function swapAudio(blob) {
  nowPlaying = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    audioEl.playsInline = true;
    audioEl.setAttribute("playsinline", "true");
    audioEl.setAttribute("webkit-playsinline", "true");
    wireAudio(audioEl);
  } else {
    try {
      audioEl.pause();
    } catch {
      /* ignore */
    }
  }
  objectUrl = URL.createObjectURL(blob);
  audioEl.src = objectUrl;
  audioEl._keepAliveOnEnded = false;
  audioEl.load();
  notify();
  return audioEl;
}

export function audioIsPlayable(el = audioEl) {
  return Boolean(el && el.getAttribute("src") && !el.error);
}

export async function playAudio(el = audioEl) {
  const target = el || audioEl;
  if (!target) throw new Error("no audio");
  rewindIfFinished(target);
  try {
    await target.play();
  } catch {
    rewindIfFinished(target, true);
    await target.play();
  }
}

export function toggleAudio() {
  if (!audioEl) return;
  if (audioEl.paused) playAudio(audioEl).catch(() => {});
  else audioEl.pause();
}

function rewindIfFinished(el, force = false) {
  const duration = Number(el.duration);
  const finished =
    force ||
    el.ended ||
    (Number.isFinite(duration) && duration > 0 && el.currentTime >= duration - 0.25);
  if (!finished) return;
  try {
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
}

export function skipAudio(seconds) {
  if (!audioEl) return;
  const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
  const next = (audioEl.currentTime || 0) + Number(seconds || 0);
  audioEl.currentTime = Math.min(duration > 0 ? duration : Math.max(0, next), Math.max(0, next));
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(nowPlaying);
    } catch (error) {
      console.warn(error);
    }
  }
}

function wireAudio(el) {
  if (el._nowPlayingWired) return;
  el._nowPlayingWired = true;
  el.addEventListener("play", notify);
  el.addEventListener("pause", notify);
  el.addEventListener("ended", () => {
    if (el.loop || el._keepAliveOnEnded) {
      notify();
      return;
    }
    rewindIfFinished(el, true);
    notify();
  });
}

function syncMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    if (!nowPlaying) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.fileName || nowPlaying.title || "Listening",
      artist: nowPlaying.title || "Listening Reader",
      album: nowPlaying.subtitle || "",
    });
    navigator.mediaSession.setActionHandler("play", () => toggleAudio());
    navigator.mediaSession.setActionHandler("pause", () => audioEl?.pause());
    navigator.mediaSession.setActionHandler("stop", () => stopAudio());
    navigator.mediaSession.setActionHandler("seekbackward", () => skipAudio(-5));
    navigator.mediaSession.setActionHandler("seekforward", () => skipAudio(5));
  } catch {
    /* ignore */
  }
}
