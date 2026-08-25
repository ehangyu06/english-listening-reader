let audioEl = null;
let objectUrl = "";

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
}

export function attachAudio(blob) {
  stopAudio();
  objectUrl = URL.createObjectURL(blob);
  audioEl = new Audio();
  audioEl.preload = "metadata";
  audioEl.playsInline = true;
  audioEl.src = objectUrl;
  return audioEl;
}

export function getAudioElement() {
  return audioEl;
}

export function swapAudio(blob) {
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
  } else {
    try {
      audioEl.pause();
    } catch {
      /* ignore */
    }
  }
  objectUrl = URL.createObjectURL(blob);
  audioEl.src = objectUrl;
  audioEl.load();
  return audioEl;
}
