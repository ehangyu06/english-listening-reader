import { getAllLessons, getLessonsByBook, groupBooks, hasAudio, getFullAudioTrack } from "../storage/lessons.js?v=20260825c";
import { getStoredBookTitles } from "../storage/books.js?v=20260816w";
import { getAudio } from "../storage/audio.js?v=20260825c";
import { getAudioElement, stopAudio, swapAudio } from "../services/audioPlayer.js?v=20260827d";
import { escapeHtml, formatTime, naturalCompare, nl2br, toast } from "../utils.js?v=20260816p";

const SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2];

let sessionId = 0;
let playing = false;
let playbackRate = 1;
let rangeDraft = null;

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
  if (route?.name === "listenPart") {
    await renderChapterList(el, route.title, route.part);
    return;
  }
  if (route?.name === "listenBook") {
    const title = String(route.title || "").trim();
    const lessons = await getLessonsByBook(title);
    const groups = groupListenChapters(lessons);
    if (usesScriptureGroups(title, groups)) {
      await renderScriptureBookList(el, title, groups);
      return;
    }
    await renderChapterList(el, title);
    return;
  }
  await renderBookList(el);
}

function clearPlayLayout(el) {
  el?.classList.remove("content-listen-play");
  document.documentElement.classList.remove("listen-play-lock", "listen-player-collapsed");
  document.body.classList.remove("listen-play-lock");
  document.querySelector(".shell-listen")?.classList.remove("shell-listen-play");
}

function applyPlayLayout(el) {
  el?.classList.add("content-listen-play");
  document.documentElement.classList.add("listen-play-lock");
  document.body.classList.add("listen-play-lock");
  document.querySelector(".shell-listen")?.classList.add("shell-listen-play");
}

const LISTEN_SHEET_KEY = "elr-listen-sheet-collapsed";

function readListenCollapsed() {
  try {
    return window.localStorage.getItem(LISTEN_SHEET_KEY) === "1";
  } catch {
    return false;
  }
}

function writeListenCollapsed(collapsed) {
  try {
    window.localStorage.setItem(LISTEN_SHEET_KEY, collapsed ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
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
      <p class="hint">책을 고르세요. Daily Bible은 성경 이름을 먼저 고른 뒤, 장 구간을 지정해서 듣습니다.</p>
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

async function renderScriptureBookList(el, bookTitle, groups) {
  clearPlayLayout(el);
  const title = String(bookTitle || "").trim();
  const books = scriptureBookGroups(groups);
  const href = (part) => `#/listen/${encodeURIComponent(title)}/${encodeURIComponent(part)}`;

  el.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="text-btn" data-go="#/listen">책 다시 선택</button>
      </div>
      <p class="hint">들을 성경을 고르세요. 성경을 추가하면 이 목록에 이름이 쌓입니다.</p>
      ${
        books.length
          ? `<div class="stack">${books
              .map((book) => {
                const audioPages = book.pages.filter(hasAudio).length;
                return `
            <a class="card book-card listen-pick-card" href="${href(book.key)}">
              <div>
                <div class="book-title">${escapeHtml(book.key)}</div>
                <div class="muted">${book.chapters.length}장 · ${book.pages.length} pages${audioPages ? ` · 🎧 ${audioPages}` : " · 오디오 없음"}</div>
              </div>
              <span class="listen-pick-go">선택</span>
            </a>`;
              })
              .join("")}</div>`
          : `<div class="empty">이 책에 재생할 성경이 없습니다.</div>`
      }
    </section>
  `;
}

async function renderChapterList(el, bookTitle, scripturePart = "") {
  clearPlayLayout(el);
  const title = String(bookTitle || "").trim();
  if (!title) {
    el.innerHTML = `<div class="empty">책을 찾지 못했습니다.</div>`;
    return;
  }

  const lessons = await getLessonsByBook(title);
  let groups = groupListenChapters(lessons);
  const part = String(scripturePart || "").trim();
  if (part) {
    const book = scriptureBookGroups(groups).find((item) => item.key === part);
    groups = book?.chapters || [];
  }

  const heading = part || title;
  const backHref = part ? `#/listen/${encodeURIComponent(title)}` : "#/listen";
  const backLabel = part ? "성경 다시 선택" : "책 다시 선택";
  const numbered = Boolean(part);

  el.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>${escapeHtml(heading)}</h2>
        <button type="button" class="text-btn" data-go="${backHref}">${backLabel}</button>
      </div>
      <p class="hint" id="listen-range-hint">${
        numbered
          ? "윗칸에서 시작 장을, 아랫칸에서 끝 장을 고르세요. 시작보다 앞 장은 고를 수 없습니다."
          : "윗칸에서 시작 챕터를, 아랫칸에서 끝 챕터를 고르세요. 시작보다 앞 챕터는 고를 수 없습니다."
      }</p>
      ${
        groups.length
          ? `
      <div class="card listen-range-card">
        <div class="listen-chip-head">
          <span class="muted">${numbered ? "장 선택" : "챕터 선택"}</span>
          <button type="button" class="text-btn" data-listen-book-start="${escapeHtml(groups[0].key)}" data-listen-book-end="${escapeHtml(groups[groups.length - 1].key)}">전체 선택</button>
        </div>
        <div class="listen-chip-section">
          <div class="listen-chip-row-label">시작</div>
          <div class="listen-chap-scroll" data-listen-start-scroll>
            <div class="listen-chap-chips">${chapterChipsHtml(groups, numbered, "start")}</div>
          </div>
        </div>
        <div class="listen-chip-section">
          <div class="listen-chip-row-label">끝</div>
          <div class="listen-chap-scroll" data-listen-end-scroll>
            <div class="listen-chap-chips">${chapterChipsHtml(groups, numbered, "end")}</div>
          </div>
        </div>
        <p class="muted listen-range-summary" id="listen-range-summary"></p>
        <button type="button" class="btn btn-wide" id="listen-range-play">이 구간 듣기</button>
      </div>
      ${
        numbered
          ? ""
          : `<div class="stack">${groups
              .map((group) => {
                const audioPages = group.pages.filter(hasAudio).length;
                return `
            <button type="button" class="card book-card listen-pick-card" data-listen-book-start="${escapeHtml(group.key)}" data-listen-book-end="${escapeHtml(group.key)}" data-listen-play-now>
              <div>
                <div class="book-title">${escapeHtml(group.key)}</div>
                <div class="muted">${group.pages.length} pages${audioPages ? ` · 🎧 ${audioPages}` : " · 오디오 없음"}</div>
              </div>
              <span class="listen-pick-go">듣기</span>
            </button>`;
              })
              .join("")}</div>`
      }`
          : `<div class="empty">이 책에 재생할 페이지가 없습니다.</div>`
      }
    </section>
  `;

  const draft = rangeDraftMatches(title, part);
  const initial = clampRangeKeys(groups, draft?.startKey || groups[0]?.key || "", draft?.endKey || draft?.startKey || groups[0]?.key || "");
  bindRangeControls(el, title, groups, {
    startKey: initial.startKey,
    endKey: initial.endKey,
    scripturePart: part,
  });
}

function rangeDraftMatches(title, part) {
  const key = `${title}\0${part || ""}`;
  return rangeDraft?.key === key ? rangeDraft : null;
}

function saveRangeDraft(title, part, startKey, endKey) {
  rangeDraft = {
    key: `${title}\0${part || ""}`,
    startKey,
    endKey,
  };
}

function chapterChipsHtml(groups, numbered, role) {
  const attr = role === "end" ? "data-listen-chip-end" : "data-listen-chip-start";
  const roleLabel = role === "end" ? "끝" : "시작";
  return groups
    .map((group) => {
      const parts = parseChapterName(group.key);
      const label = numbered && parts.number != null ? String(parts.number) : group.key;
      return `<button type="button" class="listen-chap-chip" ${attr}="${escapeHtml(group.key)}" aria-label="${escapeHtml(`${roleLabel} ${group.key}`)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function clampRangeKeys(groups, startKey, endKey) {
  const startIdx = groups.findIndex((group) => group.key === startKey);
  const start = startIdx >= 0 ? startKey : groups[0]?.key || "";
  const startIndex = groups.findIndex((group) => group.key === start);
  const endIdx = groups.findIndex((group) => group.key === endKey);
  const end = endIdx >= 0 && startIndex >= 0 && endIdx >= startIndex ? endKey : start;
  return { startKey: start, endKey: end };
}

function bindSyncedScroll(first, second) {
  if (!first || !second) return;
  let lock = false;
  const sync = (from, to) => {
    from.addEventListener(
      "scroll",
      () => {
        if (lock) return;
        lock = true;
        to.scrollLeft = from.scrollLeft;
        lock = false;
      },
      { passive: true }
    );
  };
  sync(first, second);
  sync(second, first);
}

function bindRangeControls(el, title, groups, initial = {}) {
  const summary = el.querySelector("#listen-range-summary");
  const playBtn = el.querySelector("#listen-range-play");
  const scripturePart = initial.scripturePart || "";
  const first = clampRangeKeys(groups, initial.startKey, initial.endKey);
  let startKey = first.startKey;
  let endKey = first.endKey;

  const selectedRange = () => orderedRange(groups, startKey, endKey);

  const paintChips = (selector, attr, { selectedKey, selectedClass, disableBeforeStart = false }) => {
    const range = selectedRange();
    const startIdx = groups.findIndex((group) => group.key === range.startKey);
    const endIdx = groups.findIndex((group) => group.key === range.endKey);
    el.querySelectorAll(selector).forEach((btn) => {
      const key = btn.getAttribute(attr) || "";
      const idx = groups.findIndex((group) => group.key === key);
      const disabled = disableBeforeStart && startIdx >= 0 && idx < startIdx;
      const selected = !disabled && key === selectedKey;
      const inRange = !disabled && startIdx >= 0 && idx >= startIdx && idx <= endIdx;
      btn.disabled = disabled;
      btn.classList.toggle("is-in-range", inRange);
      btn.classList.toggle("is-start", selectedClass === "is-start" && selected);
      btn.classList.toggle("is-end", selectedClass === "is-end" && selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  };

  const paint = () => {
    const range = selectedRange();
    paintChips("[data-listen-chip-start]", "data-listen-chip-start", {
      selectedKey: range.startKey,
      selectedClass: "is-start",
    });
    paintChips("[data-listen-chip-end]", "data-listen-chip-end", {
      selectedKey: range.endKey,
      selectedClass: "is-end",
      disableBeforeStart: true,
    });
    if (summary) {
      const label = range.startKey && range.startKey === range.endKey ? range.startKey : `${range.startKey} – ${range.endKey}`;
      summary.textContent = range.queue.length
        ? `${label} · 🎧 ${range.queue.length}`
        : "이 구간에 오디오가 없습니다.";
    }
    if (playBtn) playBtn.disabled = !range.queue.length;
  };

  const revealChip = (key) => {
    const chip = [...el.querySelectorAll("[data-listen-chip-start]")].find((btn) => btn.getAttribute("data-listen-chip-start") === key);
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  const setRange = (nextStart, nextEnd, { play = false, reveal = "" } = {}) => {
    const next = clampRangeKeys(groups, nextStart, nextEnd);
    startKey = next.startKey;
    endKey = next.endKey;
    saveRangeDraft(title, scripturePart, startKey, endKey);
    paint();
    if (reveal) revealChip(reveal);
    if (play) startPlayback(el, title, groups, startKey, endKey, scripturePart);
  };

  el.querySelectorAll("[data-listen-chip-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-listen-chip-start") || "";
      setRange(key, endKey, { reveal: key });
    });
  });
  el.querySelectorAll("[data-listen-chip-end]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const key = btn.getAttribute("data-listen-chip-end") || "";
      setRange(startKey, key, { reveal: key });
    });
  });
  el.querySelectorAll("[data-listen-book-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextStart = btn.getAttribute("data-listen-book-start") || "";
      const nextEnd = btn.getAttribute("data-listen-book-end") || nextStart;
      setRange(nextStart, nextEnd, {
        play: btn.hasAttribute("data-listen-play-now"),
        reveal: btn.hasAttribute("data-listen-play-now") ? "" : nextStart,
      });
    });
  });
  playBtn?.addEventListener("click", () => {
    const range = selectedRange();
    saveRangeDraft(title, scripturePart, range.startKey, range.endKey);
    startPlayback(el, title, groups, range.startKey, range.endKey, scripturePart);
  });
  bindSyncedScroll(el.querySelector("[data-listen-start-scroll]"), el.querySelector("[data-listen-end-scroll]"));
  saveRangeDraft(title, scripturePart, startKey, endKey);
  paint();
}

const GENERIC_CHAPTER_PREFIXES = new Set([
  "chapter",
  "ch",
  "chap",
  "챕터",
  "part",
  "unit",
  "lesson",
  "book",
  "장",
]);

function parseChapterName(chapter) {
  const raw = String(chapter || "").trim() || "기타";
  const match = raw.match(/^(.*?)[\s._-]*(\d+)\s*(?:장|chapter)?\s*$/i);
  if (!match) return { raw, prefix: "", number: null };
  const prefix = String(match[1] || "")
    .trim()
    .replace(/[.\s]+$/g, "");
  const number = Number(match[2]);
  if (!prefix) return { raw, prefix: "", number };
  return { raw, prefix, number };
}

function isScripturePrefix(prefix) {
  const key = String(prefix || "").trim();
  if (!key) return false;
  return !GENERIC_CHAPTER_PREFIXES.has(key.toLowerCase());
}

function usesScriptureGroups(bookTitle, groups) {
  if (/bible|성경/i.test(String(bookTitle || ""))) return true;
  const prefixes = new Set();
  for (const group of groups) {
    const parts = parseChapterName(group.key);
    if (parts.number == null || !isScripturePrefix(parts.prefix)) continue;
    prefixes.add(parts.prefix);
  }
  return prefixes.size >= 2;
}

function groupListenChapters(lessons) {
  const map = new Map();
  const order = [];
  for (const lesson of lessons) {
    const key = String(lesson.chapter || "").trim() || "기타";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(lesson);
  }
  return order
    .slice()
    .sort(naturalCompare)
    .map((key) => {
      const pages = map.get(key).slice().sort((a, b) => {
        const chapter = naturalCompare(a.chapter, b.chapter);
        if (chapter !== 0) return chapter;
        return naturalCompare(a.page, b.page);
      });
      return { key, pages };
    });
}

function scriptureBookGroups(groups) {
  const map = new Map();
  const order = [];
  for (const group of groups) {
    const parts = parseChapterName(group.key);
    if (parts.number == null || !isScripturePrefix(parts.prefix)) continue;
    if (!map.has(parts.prefix)) {
      map.set(parts.prefix, []);
      order.push(parts.prefix);
    }
    map.get(parts.prefix).push(group);
  }
  return order
    .map((key) => {
      const chapters = map.get(key);
      return {
        key,
        startKey: chapters[0].key,
        endKey: chapters[chapters.length - 1].key,
        pages: chapters.flatMap((chapter) => chapter.pages),
        chapters,
      };
    })
    .sort((a, b) => {
      const latest = (book) =>
        book.pages.reduce((max, page) => {
          const time = String(page.updatedAt || page.createdAt || "");
          return time > max ? time : max;
        }, "");
      return latest(b).localeCompare(latest(a));
    });
}

function orderedRange(groups, startKey, endKey) {
  let start = groups.findIndex((group) => group.key === startKey);
  let end = groups.findIndex((group) => group.key === endKey);
  if (start < 0 && end < 0) return { startKey: "", endKey: "", queue: [] };
  if (start < 0) start = end;
  if (end < 0) end = start;
  if (start > end) [start, end] = [end, start];
  const queue = [];
  for (const group of groups.slice(start, end + 1)) {
    queue.push(...group.pages.filter(hasAudio));
  }
  return {
    startKey: groups[start].key,
    endKey: groups[end].key,
    queue,
  };
}

function startPlayback(el, bookTitle, groups, startKey, endKey, scripturePart = "") {
  const range = orderedRange(groups, startKey, endKey);
  const queue = range.queue;
  if (!queue.length) {
    toast("이 구간에 들을 오디오가 없습니다.");
    return;
  }
  const rangeText = range.startKey === range.endKey ? range.startKey : `${range.startKey} – ${range.endKey}`;

  const mySession = ++sessionId;
  playing = true;
  let index = 0;
  let seeking = false;
  let framed = false;
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
    audio._keepAliveOnEnded = true;
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
      await renderChapterList(el, bookTitle, scripturePart);
      return;
    }
    const lesson = queue[nextIndex];
    getAudioElement()?.pause();
    const blob = await loadBlob(lesson);
    if (mySession !== sessionId) return;
    if (!blob) {
      toast("저장된 오디오를 찾지 못해 다음 페이지로 넘어갑니다.");
      await playAt(nextIndex + 1, { auto: true });
      return;
    }
    index = nextIndex;
    const audio = swapAudio(blob);
    if (!framed) {
      drawPlayer(el, bookTitle, queue, index, rangeText);
      bindListenSheet(el);
      bindDrawnControls();
      framed = true;
    } else {
      updatePlayerNow(el, bookTitle, queue, index, rangeText);
    }
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
      await renderChapterList(el, bookTitle, scripturePart);
    });
    el.querySelector("#listen-chapters")?.addEventListener("click", async () => {
      if (mySession !== sessionId) return;
      stopListenSession();
      stopAudio();
      await renderChapterList(el, bookTitle, scripturePart);
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

function nowLine(queue, index) {
  const lesson = queue[index];
  const next = queue[index + 1];
  return `${lesson.chapter} · Page ${lesson.page} · ${index + 1} / ${queue.length}${
    next ? ` · 다음 ${next.chapter} · Page ${next.page}` : ""
  }`;
}

function scriptHtml(lesson) {
  const script = String(lesson.script || "").trim();
  return script ? nl2br(script) : `<span class="muted">이 페이지에 영문 스크립트가 없습니다.</span>`;
}

function koreanHtml(lesson) {
  const korean = String(lesson.literalTranslationKo || "").trim();
  return korean ? nl2br(korean) : `<span class="muted">이 페이지에 한글 직역이 없습니다.</span>`;
}

function updatePlayerNow(el, bookTitle, queue, index, rangeText) {
  const lesson = queue[index];
  const next = queue[index + 1];
  const now = el.querySelector("[data-listen-now]");
  if (now) now.textContent = nowLine(queue, index);
  const mini = el.querySelector("[data-listen-mini]");
  if (mini) mini.textContent = `${lesson.chapter} · ${index + 1}/${queue.length}`;
  const nextBtn = el.querySelector("#listen-next");
  if (nextBtn) nextBtn.disabled = !next;
  const kicker = el.querySelector("[data-listen-range]");
  if (kicker) kicker.textContent = `연속듣기${rangeText ? ` · ${rangeText}` : ""}`;
  const scriptEl = el.querySelector("#listen-script");
  const koEl = el.querySelector("#listen-ko");
  if (scriptEl) {
    scriptEl.innerHTML = scriptHtml(lesson);
    scriptEl.scrollTop = 0;
  }
  if (koEl) {
    koEl.innerHTML = koreanHtml(lesson);
    koEl.scrollTop = 0;
  }
}

function bindListenSheet(el) {
  const dock = el.querySelector("#listen-player-dock");
  if (!dock) return;
  const apply = (collapsed) => {
    dock.classList.toggle("is-collapsed", collapsed);
    document.documentElement.classList.toggle("listen-player-collapsed", collapsed);
    const toggle = dock.querySelector("#listen-sheet-toggle");
    toggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const hint = toggle?.querySelector("[data-collapse-label]");
    if (hint) hint.textContent = collapsed ? "터치해서 펼치기" : "터치해서 숨기기";
  };
  apply(readListenCollapsed());
  dock.querySelector("#listen-sheet-toggle")?.addEventListener("click", (event) => {
    event.preventDefault();
    const next = !dock.classList.contains("is-collapsed");
    writeListenCollapsed(next);
    apply(next);
  });
  dock.addEventListener("click", (event) => {
    if (!dock.classList.contains("is-collapsed")) return;
    if (event.target.closest("#listen-play, #listen-sheet-toggle, #listen-stop")) return;
    writeListenCollapsed(false);
    apply(false);
  });
}

function drawPlayer(el, bookTitle, queue, index, rangeText = "") {
  const lesson = queue[index];
  const next = queue[index + 1];
  const speeds = SPEEDS.map((speed) => {
    const active = speed === playbackRate ? "is-active" : "";
    const text = speed === 1 ? "1.0x" : `${speed}x`;
    return `<button type="button" class="chip ${active}" data-listen-rate="${speed}">${text}</button>`;
  }).join("");

  applyPlayLayout(el);
  el.innerHTML = `
    <section class="listen-play">
      <div class="listen-texts">
        <section class="listen-col">
          <h2>영문 Script</h2>
          <div class="listen-script" id="listen-script">${scriptHtml(lesson)}</div>
        </section>
        <section class="listen-col">
          <h2>한글 직역</h2>
          <div class="listen-ko" id="listen-ko">${koreanHtml(lesson)}</div>
        </section>
      </div>
      <aside class="listen-player-dock" id="listen-player-dock">
        <div class="player listen-player">
          <button type="button" class="audio-sheet-handle" id="listen-sheet-toggle" aria-expanded="true">
            <span class="audio-sheet-pill" aria-hidden="true"></span>
            <span class="audio-sheet-hint" data-collapse-label>터치해서 숨기기</span>
          </button>
          <div class="listen-player-main">
            <div class="listen-now">
              <div class="player-kicker" data-listen-range>연속듣기${rangeText ? ` · ${escapeHtml(rangeText)}` : ""}</div>
              <div class="book-title">${escapeHtml(bookTitle)}</div>
              <div class="muted" data-listen-now>${escapeHtml(nowLine(queue, index))}</div>
              <div class="listen-mini-now" data-listen-mini>${escapeHtml(lesson.chapter)} · ${index + 1}/${queue.length}</div>
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
                <button type="button" class="text-btn" id="listen-chapters">구간 선택</button>
                <button type="button" class="text-btn danger" id="listen-stop">중단</button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </section>
  `;
}
