import { parseRoute } from "../router.js?v=20260818k";
import {
  getAudioElement,
  getNowPlaying,
  onNowPlayingChange,
  skipAudio,
  stopAudio,
  toggleAudio,
} from "../services/audioPlayer.js?v=20260827d";
import { escapeHtml, go } from "../utils.js?v=20260816p";

export function bindNowPlaying() {
  const mount = ensureMount();
  const paint = () => renderNowPlaying(mount);
  onNowPlayingChange(paint);
  window.addEventListener("hashchange", paint);
  paint();
}

export function refreshNowPlaying() {
  const mount = document.getElementById("now-playing");
  if (mount) renderNowPlaying(mount);
}

function ensureMount() {
  let el = document.getElementById("now-playing");
  if (el) return el;
  el = document.createElement("aside");
  el.id = "now-playing";
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function renderNowPlaying(mount) {
  const info = getNowPlaying();
  const audio = getAudioElement();
  const route = parseRoute();
  const onSource = info?.kind === "lesson" && route.name === "lesson" && route.id === info.lessonId;
  const show = Boolean(info?.kind === "lesson" && audio && !onSource);

  document.documentElement.classList.toggle("has-now-playing", show);
  if (!show) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  const paused = audio.paused;
  mount.hidden = false;
  mount.innerHTML = `
    <div class="now-playing-transport">
      <button type="button" class="btn btn-ghost now-playing-skip" id="now-playing-back" aria-label="5초 뒤로">-5초</button>
      <button type="button" class="btn btn-play btn-play-round now-playing-toggle" id="now-playing-toggle" aria-label="${
        paused ? "재생" : "일시정지"
      }">${paused ? "▶" : "⏸"}</button>
      <button type="button" class="btn btn-ghost now-playing-skip" id="now-playing-fwd" aria-label="5초 앞으로">+5초</button>
    </div>
    <button type="button" class="now-playing-main" id="now-playing-open">
      <span class="now-playing-title">${escapeHtml(info.title || "학습 페이지")}</span>
      <span class="now-playing-sub">${escapeHtml(info.subtitle || info.fileName || "재생 중")}</span>
    </button>
    <button type="button" class="btn btn-play now-playing-go" id="now-playing-go">이 페이지</button>
    <button type="button" class="btn btn-ghost now-playing-stop" id="now-playing-stop">중단</button>
  `;

  mount.querySelector("#now-playing-back")?.addEventListener("click", (event) => {
    event.preventDefault();
    skipAudio(-5);
  });
  mount.querySelector("#now-playing-fwd")?.addEventListener("click", (event) => {
    event.preventDefault();
    skipAudio(5);
  });
  mount.querySelector("#now-playing-toggle")?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleAudio();
  });
  const open = () => {
    if (info.href) go(info.href);
  };
  mount.querySelector("#now-playing-open")?.addEventListener("click", open);
  mount.querySelector("#now-playing-go")?.addEventListener("click", open);
  mount.querySelector("#now-playing-stop")?.addEventListener("click", () => stopAudio());
}
