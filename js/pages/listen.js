import { getAllLessons, getLessonsByBook, groupBooks, hasAudio, getFullAudioTrack } from "../storage/lessons.js?v=20260825c";
import { getStoredBookTitles } from "../storage/books.js?v=20260816w";
import { getAudio } from "../storage/audio.js?v=20260825c";
import { getAudioElement, stopAudio, swapAudio } from "../services/audioPlayer.js?v=20260826d";
import { escapeHtml, formatTime, naturalCompare, nl2br, toast } from "../utils.js?v=20260816p";

const SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2];

let sessionId = 0;
let playing = false;
let playbackRate = 1;

export function stopListenSession() {
  sessionId += 1;
  playing = false;
  clearPlayLayout();
}

export function isListenPlaying() {
  return playing;
}

export async function renderListen(el, route) {
  playing = false;
  clearPlayLayout(el);
  if (route?.name === "listenBook") {
    await renderChapterList(el, route.title);
    return;
  }
  await renderBookList(el);
}

function clearPlayLayout(el) {
  el?.classList.remove("content-listen-play");
  document.documentElement.classList.remove("listen-play-lock");
  document.body.classList.remove("listen-play-lock");
  document.querySelector(".shell-listen")?.classList.remove("shell-listen-play");
}

function applyPlayLayout(el) {
  el?.classList.add("content-listen-play");
  document.documentElement.classList.add("listen-play-lock");
  document.body.classList.add("listen-play-lock");
  document.querySelector(".shell-listen")?.classList.add("shell-listen-play");
}

async function renderBookList(el) {
  const lessons = await getAllLessons();
  const storedTitles = await getStoredBookTitles();
  const books = groupBooks(lessons, storedTitles);
  const audioCount = new Map();
  for (const lesson of lessons) {
    if (!hasAudio(lesson)) continue;
    const title = lesson.bookTitle || "제목 없음";
    audioCount.set(title, (audioCount.get(title) || 0) + 1);
  }

  el.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>책 선택</h2>
      </div>
      <p class="hint">책을 고르면 챕터를 선택할 수 있습니다. 선택한 챕터부터 페이지 순서대로 오디오가 이어집니다.</p>
      ${
        books.length
          ? `<div class="stack">${books
              .map((book) => {
                const audio = audioCount.get(book.title) || 0;
                return `
            <a class="card book-card listen-pick-card" href="#/listen/${encodeURIComponent(book.title)}">
              <div>
                <div class="book-title">${escapeHtml(book.title)}</div>
                <div class="muted">${book.count} pages${audio ? ` · 🎧 ${audio}` : " · 오디오 없음"}</div>
              </div>
              <span class="listen-pick-go">선택</span>
            </a>`;
              })
              .join("")}</div>`
          : `<div class="empty">아직 책이 없습니다. 먼저 학습자료를 추가해 주세요.</div>`
      }
    </section>
  `;
}

async function renderChapterList(el, bookTitle) {
  clearPlayLayout(el);
  const title = String(bookTitle || "").trim();
  if (!title) {
    el.innerHTML = `<div class="empty">책을 찾지 못했습니다.</div>`;
    return;
  }

  const lessons = await getLessonsByBook(title);
  const groups = groupListenChapters(lessons);

  el.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="text-btn" data-go="#/listen">책 다시 선택</button>
      </div>
      <p class="hint">챕터를 누르면 그 챕터의 첫 페이지부터 재생합니다. 멈추지 않으면 다음 챕터로 자동으로 이어집니다.</p>
      ${
        groups.length
          ? `<div class="stack">${groups
              .map((group) => {
                const audioPages = group.pages.filter(hasAudio).length;
                const range = chapterRangeLabel(group);
                return `
            <button type="button" class="card book-card listen-pick-card" data-listen-chapter="${escapeHtml(group.key)}">
              <div>
                <div class="book-title">${escapeHtml(group.key)}</div>
                <div class="muted">${escapeHtml(range)} · ${group.pages.length} pages${audioPages ? ` · 🎧 ${audioPages}` : " · 오디오 없음"}</div>
              </div>
              <span class="listen-pick-go">듣기</span>
            </button>`;
              })
              .join("")}</div>`
          : `<div class="empty">이 책에 재생할 페이지가 없습니다.</div>`
      }
    </section>
  `;

  el.querySelectorAll("[data-listen-chapter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-listen-chapter") || "";
      startPlayback(el, title, key, groups);
    });
  });
}

function groupListenChapters(lessons) {
  const map = new Map();
  const order = [];
  for (const lesson of lessons) {
    const key = listenChapterKey(lesson.chapter);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(lesson);
  }
  return order.map((key) => {
    const pages = map.get(key).slice().sort((a, b) => {
      const chapter = naturalCompare(a.chapter, b.chapter);
      if (chapter !== 0) return chapter;
      return naturalCompare(a.page, b.page);
    });
    return { key, pages };
  });
}

function listenChapterKey(chapter) {
  const raw = String(chapter || "").trim();
  if (!raw) return "기타";
  const match = raw.match(/^([가-힣]+(?:\s*[가-힣]+)*)\s*(\d+)/);
  if (match) return match[1].trim();
  return raw;
}

function chapterRangeLabel(group) {
  const names = [];
  const seen = new Set();
  for (const lesson of group.pages) {
    const name = String(lesson.chapter || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (!names.length) return group.key;
  if (names.length === 1) return names[0];
  return `${names[0]} – ${names[names.length - 1]}`;
}

function queueFromChapter(groups, startKey) {
  const start = groups.findIndex((group) => group.key === startKey);
  if (start < 0) return [];
  const queue = [];
  for (const group of groups.slice(start)) {
    queue.push(...group.pages.filter(hasAudio));
  }
  return queue;
}

function startPlayback(el, bookTitle, startKey, groups) {
  const queue = queueFromChapter(groups, startKey);
  if (!queue.length) {
    toast("이 챕터부터 이어서 들을 오디오가 없습니다.");
    return;
  }

  const mySession = ++sessionId;
  playing = true;
  let index = 0;
  let seeking = false;
  const blobs = new Map();

  const loadBlob = async (lesson) => {
    if (!lesson) return null;
    if (blobs.has(lesson.id)) return blobs.get(lesson.id);
    const track = getFullAudioTrack(lesson);
    const record = track?.audioId ? await getAudio(track.audioId) : null;
    const blob = record?.blob || null;
    blobs.set(lesson.id, blob);
    return blob;
  };

  const preloadAround = (from) => {
    loadBlob(queue[from + 1]).catch(() => {});
    loadBlob(queue[from + 2]).catch(() => {});
  };

  const paint = () => {
    if (!playing || mySession !== sessionId) return;
    const audio = getAudioElement();
    const lesson = queue[index];
    const currentEl = el.querySelector("#listen-current");
    const totalEl = el.querySelector("#listen-total");
    const seek = el.querySelector("#listen-seek");
    const playBtn = el.querySelector("#listen-play");
    if (!audio || !currentEl || !seek || !playBtn) return;
    if (!seeking) seek.value = String(audio.currentTime || 0);
    currentEl.textContent = formatTime(audio.currentTime);
    const duration = Number.isFinite(audio.duration) ? audio.duration : getFullAudioTrack(lesson)?.duration || 0;
    seek.max = String(Math.max(1, duration));
    totalEl.textContent = formatTime(duration);
    playBtn.textContent = audio.paused ? "▶" : "⏸";
  };

  const bindPlayer = (audio) => {
    audio.playbackRate = playbackRate;
    audio.ontimeupdate = paint;
    audio.onloadedmetadata = paint;
    audio.onplay = paint;
    audio.onpause = paint;
    audio.onended = () => {
      if (!playing || mySession !== sessionId) return;
      playAt(index + 1, { auto: true });
    };
  };

  const playAt = async (nextIndex, { auto = false } = {}) => {
    if (mySession !== sessionId) return;
    if (nextIndex >= queue.length) {
      playing = false;
      stopAudio();
      toast("선택한 구간을 끝까지 들었습니다.");
      await renderChapterList(el, bookTitle);
      return;
    }
    index = nextIndex;
    const lesson = queue[index];
    drawPlayer(el, bookTitle, queue, index);
    window.scrollTo(0, 0);
    bindDrawnControls();
    const blob = await loadBlob(lesson);
    if (mySession !== sessionId) return;
    if (!blob) {
      toast("저장된 오디오를 찾지 못해 다음 페이지로 넘어갑니다.");
      await playAt(index + 1, { auto: true });
      return;
    }
    const audio = swapAudio(blob);
    bindPlayer(audio);
    paint();
    preloadAround(index);
    try {
      await audio.play();
    } catch {
      if (!auto) toast("재생을 눌러 주세요.");
      paint();
    }
  };

  const bindDrawnControls = () => {
    const audioNow = () => getAudioElement();
    el.querySelector("#listen-play")?.addEventListener("click", () => {
      const audio = audioNow();
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => toast("재생을 시작하지 못했습니다."));
      else audio.pause();
    });
    el.querySelector("#listen-back")?.addEventListener("click", () => {
      const audio = audioNow();
      if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5);
    });
    el.querySelector("#listen-fwd")?.addEventListener("click", () => {
      const audio = audioNow();
      if (!audio) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      audio.currentTime = Math.min(duration, audio.currentTime + 5);
    });
    el.querySelector("#listen-restart")?.addEventListener("click", () => {
      const audio = audioNow();
      if (!audio) return;
      audio.currentTime = 0;
      audio.play().catch(() => toast("재생을 시작하지 못했습니다."));
    });
    el.querySelector("#listen-next")?.addEventListener("click", () => {
      playAt(index + 1);
    });
    el.querySelector("#listen-stop")?.addEventListener("click", async () => {
      if (mySession !== sessionId) return;
      stopListenSession();
      stopAudio();
      toast("연속듣기를 멈췄습니다.");
      await renderChapterList(el, bookTitle);
    });
    el.querySelector("#listen-chapters")?.addEventListener("click", async () => {
      if (mySession !== sessionId) return;
      stopListenSession();
      stopAudio();
      await renderChapterList(el, bookTitle);
    });
    const seek = el.querySelector("#listen-seek");
    const currentEl = el.querySelector("#listen-current");
    seek?.addEventListener("input", () => {
      seeking = true;
      if (currentEl) currentEl.textContent = formatTime(Number(seek.value));
    });
    seek?.addEventListener("change", () => {
      const audio = audioNow();
      if (audio) audio.currentTime = Number(seek.value);
      seeking = false;
    });
    el.querySelectorAll("[data-listen-rate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playbackRate = Number(btn.dataset.listenRate) || 1;
        const audio = audioNow();
        if (audio) audio.playbackRate = playbackRate;
        el.querySelectorAll("[data-listen-rate]").forEach((item) => {
          item.classList.toggle("is-active", item === btn);
        });
      });
    });
  };

  playAt(0);
}

function drawPlayer(el, bookTitle, queue, index) {
  const lesson = queue[index];
  const next = queue[index + 1];
  const speeds = SPEEDS.map((speed) => {
    const active = speed === playbackRate ? "is-active" : "";
    const text = speed === 1 ? "1.0x" : `${speed}x`;
    return `<button type="button" class="chip ${active}" data-listen-rate="${speed}">${text}</button>`;
  }).join("");
  const script = String(lesson.script || "").trim();
  const korean = String(lesson.literalTranslationKo || "").trim();

  applyPlayLayout(el);
  el.innerHTML = `
    <section class="listen-play">
      <div class="player listen-player">
        <div class="listen-player-main">
          <div class="listen-now">
            <div class="player-kicker">연속듣기</div>
            <div class="book-title">${escapeHtml(bookTitle)}</div>
            <div class="muted">${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)} · ${index + 1} / ${queue.length}${
              next ? ` · 다음 ${escapeHtml(next.chapter)} · Page ${escapeHtml(next.page)}` : ""
            }</div>
          </div>
          <div class="audio-transport listen-transport">
            <button type="button" class="btn btn-ghost btn-skip" id="listen-back" aria-label="5초 뒤로">-5초</button>
            <button type="button" class="btn btn-play btn-play-round" id="listen-play" aria-label="재생">▶</button>
            <button type="button" class="btn btn-ghost btn-skip" id="listen-fwd" aria-label="5초 앞으로">+5초</button>
          </div>
        </div>
        <div class="listen-player-tools">
          <div class="listen-seek-row">
            <span id="listen-current">00:00</span>
            <input id="listen-seek" class="audio-seek" type="range" min="0" max="1" value="0" step="0.1">
            <span id="listen-total">00:00</span>
          </div>
          <div class="listen-tool-row">
            <div class="speed-row">${speeds}</div>
            <div class="listen-tool-actions">
              <button type="button" class="text-btn" id="listen-restart">처음부터</button>
              <button type="button" class="text-btn" id="listen-next" ${next ? "" : "disabled"}>다음 페이지</button>
              <button type="button" class="text-btn" id="listen-chapters">챕터 선택</button>
              <button type="button" class="text-btn danger" id="listen-stop">중단</button>
            </div>
          </div>
        </div>
      </div>
      <div class="listen-texts">
        <section class="listen-col">
          <h2>영문 Script</h2>
          <div class="listen-script">${
            script ? nl2br(script) : `<span class="muted">이 페이지에 영문 스크립트가 없습니다.</span>`
          }</div>
        </section>
        <section class="listen-col">
          <h2>한글 직역</h2>
          <div class="listen-ko">${
            korean ? nl2br(korean) : `<span class="muted">이 페이지에 한글 직역이 없습니다.</span>`
          }</div>
        </section>
      </div>
    </section>
  `;
}
