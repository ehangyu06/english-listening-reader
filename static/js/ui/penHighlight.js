import { escapeHtml, toast } from "../utils.js?v=20260816p";

const FIELD_KEY = {
  example: "exampleHighlights",
  exampleKo: "exampleKoHighlights",
};

let active = null;
let applying = false;

export function renderPenText(text, ranges) {
  return wrapRanges(String(text || ""), validRanges(text, ranges)).replace(/\n/g, "<br>");
}

export function remapHighlights(oldText, newText, ranges) {
  const next = [];
  const hay = String(newText || "");
  for (const range of validRanges(oldText, ranges)) {
    const snippet = String(oldText || "").slice(range.start, range.end);
    if (!snippet.trim()) continue;
    const index = hay.indexOf(snippet);
    if (index < 0) continue;
    next.push({ start: index, end: index + snippet.length, at: range.at || "" });
  }
  return mergeRanges(next);
}

export function bindExamplePen({ root, resolve, onChange, onUnbind }) {
  unbindExamplePen(root);
  root._penResolve = resolve;
  root._penOnChange = onChange;
  root._penOnUnbind = onUnbind;
  const state = { root, resolve, onChange, timer: 0, tap: null };
  const onSel = () => scheduleShow(state);
  const onPointerDown = (event) => {
    const bar = document.querySelector(".pen-bar");
    if (bar?.contains(event.target)) return;
    if (event.target.closest?.("[data-pen-erase]")) return;
    const mark = event.target.closest?.(".pen-mark");
    if (mark && state.root.contains(mark)) {
      state.tap = { mark, x: event.clientX, y: event.clientY };
      return;
    }
    state.tap = { mark: null, x: event.clientX, y: event.clientY, unpick: true };
    hidePenBar(false);
  };
  const onPointerUp = (event) => {
    const tap = state.tap;
    state.tap = null;
    if (!tap) return;
    const moved = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
    if (moved > 10) return;
    if (tap.mark && state.root.contains(tap.mark)) {
      pickMark(tap.mark, state);
      return;
    }
    if (tap.unpick) unpick();
  };
  document.addEventListener("selectionchange", onSel);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  root._penBind = { onSel, onPointerDown, onPointerUp };
}

export function unbindExamplePen(root) {
  const bind = root?._penBind;
  const onUnbind = root?._penOnUnbind;
  if (bind) {
    document.removeEventListener("selectionchange", bind.onSel);
    document.removeEventListener("pointerdown", bind.onPointerDown, true);
    document.removeEventListener("pointerup", bind.onPointerUp, true);
  }
  delete root?._penBind;
  delete root?._penResolve;
  delete root?._penOnChange;
  delete root?._penOnUnbind;
  unpick();
  hidePenBar();
  onUnbind?.();
}

function scheduleShow(state) {
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => showFromSelection(state), 160);
}

function showFromSelection(state) {
  if (!state.root?.isConnected) {
    unbindExamplePen(state.root);
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  if (document.querySelector(".pen-mark.is-pen-picked")) return;
  const range = sel.getRangeAt(0);
  const host = hostFromRange(range);
  if (!host || !state.root.contains(host)) return;
  const start = caretOffset(host, range.startContainer, range.startOffset);
  const end = caretOffset(host, range.endContainer, range.endOffset);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (to - from < 2) return;
  const text = String(
    (host.getAttribute("data-pen-field") === "exampleKo"
      ? state.resolve(host)?.item?.exampleKo
      : state.resolve(host)?.item?.example) || host.textContent || ""
  );
  unpick();
  active = {
    host,
    field: host.getAttribute("data-pen-field"),
    start: from,
    end: to,
    resolve: state.resolve,
    onChange: state.onChange,
  };
  placeBar(text.slice(from, to), "apply");
}

function pickMark(mark, state) {
  const host = mark.closest("[data-pen-field]");
  if (!host || !state.root.contains(host)) return;
  const start = Number(mark.getAttribute("data-pen-start"));
  const end = Number(mark.getAttribute("data-pen-end"));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  unpick();
  mark.classList.add("is-pen-picked");
  active = {
    host,
    field: host.getAttribute("data-pen-field"),
    start,
    end,
    resolve: state.resolve,
    onChange: state.onChange,
    snippetCard: host.getAttribute("data-pen-snippet") === "1",
  };
  hidePenBar(false);
  selectWholeMark(mark);
  placeBar(mark.textContent || "", "erase");
}

function selectWholeMark(mark) {
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(mark);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore
  }
}

function unpick() {
  document.querySelectorAll(".pen-mark.is-pen-picked").forEach((node) => {
    node.classList.remove("is-pen-picked");
  });
  const bar = document.querySelector(".pen-bar");
  if (bar?.classList.contains("is-erase")) hidePenBar(false);
  if (!applying) active = null;
}

function placeBar(snippet, mode = "apply") {
  const bar = ensureBar();
  const preview = String(snippet || "").replace(/\s+/g, " ").trim();
  bar.querySelector("[data-pen-snippet]").textContent =
    preview.length > 42 ? `${preview.slice(0, 42)}…` : preview;
  bar.classList.toggle("is-erase", mode === "erase");
  bar.querySelector("[data-pen-apply]").hidden = mode === "erase";
  bar.querySelector("[data-pen-erase]").hidden = mode !== "erase";
  bar.classList.add("is-on");
  positionBar(bar);
}

function ensureBar() {
  let bar = document.querySelector(".pen-bar");
  if (bar && (!bar.querySelector("[data-pen-snippet]") || !bar.querySelector("[data-pen-erase]"))) {
    bar.remove();
    bar = null;
  }
  if (bar) return bar;
  bar = document.createElement("div");
  bar.className = "pen-bar";
  bar.innerHTML = `
    <p class="pen-bar-snippet" data-pen-snippet></p>
    <div class="pen-bar-actions">
      <button type="button" class="pen-apply" data-pen-apply>형광펜 칠하기</button>
      <button type="button" class="pen-erase" data-pen-erase hidden>형광펜 지우기</button>
      <button type="button" data-pen-close>닫기</button>
    </div>
  `;
  const press = (event, add) => {
    event.preventDefault();
    event.stopPropagation();
    applyPen(add);
  };
  bar.querySelector("[data-pen-apply]").addEventListener("pointerdown", (event) => press(event, true));
  bar.querySelector("[data-pen-erase]").addEventListener("pointerdown", (event) => press(event, false));
  bar.querySelector("[data-pen-close]").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hidePenBar(true);
  });
  document.body.appendChild(bar);
  bindBarPositionWatch();
  return bar;
}

function bindBarPositionWatch() {
  if (window._penPosBound) return;
  window._penPosBound = true;
  const update = () => {
    const bar = document.querySelector(".pen-bar.is-on");
    if (bar) positionBar(bar);
  };
  window.addEventListener("resize", update);
  document.addEventListener("scroll", update, true);
}

function positionBar(bar) {
  measureChrome();
  bar.classList.remove("is-top", "is-side");
  const place = () => {
    const sel = selectionBounds();
    if (!sel) return;
    const bottomBox = bar.getBoundingClientRect();
    if (!rectsOverlap(sel, bottomBox, 14)) return;
    bar.classList.add("is-top");
    const topBox = bar.getBoundingClientRect();
    if (!rectsOverlap(sel, topBox, 14)) return;
    bar.classList.remove("is-top");
    bar.classList.add("is-side");
  };
  if (bar.getBoundingClientRect().height) place();
  else window.requestAnimationFrame(place);
}

function measureChrome() {
  const nav = document.querySelector(".bottom-nav");
  const topbar = document.querySelector(".topbar");
  const root = document.documentElement;
  if (nav) {
    const gap = Math.max(10, Math.round(window.innerHeight - nav.getBoundingClientRect().top + 8));
    root.style.setProperty("--pen-bar-bottom", `${gap}px`);
  }
  if (topbar) {
    const top = Math.max(8, Math.round(topbar.getBoundingClientRect().bottom + 8));
    root.style.setProperty("--pen-bar-top", `${top}px`);
  }
}

function selectionBounds() {
  const mark = document.querySelector(".pen-mark.is-pen-picked");
  const rects = mark
    ? [mark.getBoundingClientRect()]
    : [...(window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).getClientRects() : [])];
  const usable = rects.filter((rect) => rect.width || rect.height);
  if (!usable.length) return null;
  return {
    top: Math.min(...usable.map((rect) => rect.top)) - 6,
    bottom: Math.max(...usable.map((rect) => rect.bottom)) + 22,
    left: Math.min(...usable.map((rect) => rect.left)),
    right: Math.max(...usable.map((rect) => rect.right)),
  };
}

function rectsOverlap(a, b, pad = 0) {
  return a.top < b.bottom + pad && a.bottom > b.top - pad && a.left < b.right + pad && a.right > b.left - pad;
}

async function applyPen(add) {
  const current = active;
  if (applying || !current) return;
  applying = true;
  const resolve = current.resolve || findResolve(current.host);
  const found = resolve?.(current.host);
  const item = found?.item;
  const field = current.field === "exampleKo" ? "exampleKo" : "example";
  const key = FIELD_KEY[field];
  const text = String(item?.[field] || "");
  if (!item || !text || !found?.save) {
    hidePenBar(true);
    applying = false;
    return;
  }
  const prev = (item[key] || []).map((row) => ({ ...row }));
  item[key] = add
    ? mergeRanges([
        ...validRanges(text, item[key]),
        { start: current.start, end: current.end, at: new Date().toISOString() },
      ])
    : subtractRange(item[key], { start: current.start, end: current.end }, text);
  if (!found.deferRank) {
    item.updatedAt = new Date().toISOString();
    if (found.lesson) found.lesson.updatedAt = item.updatedAt;
  }
  try {
    await found.save();
    if (current.host.isConnected && current.host.getAttribute("data-pen-snippet") !== "1") {
      current.host.innerHTML = renderPenText(text, item[key]);
    }
    toast(add ? "형광펜을 칠했습니다." : "형광펜을 지웠습니다.");
    current.onChange?.({ item, lesson: found.lesson });
  } catch (error) {
    console.error(error);
    item[key] = prev;
    toast("저장하지 못했습니다. 다시 시도해 주세요.");
  }
  hidePenBar(true);
  applying = false;
}

function findResolve(host) {
  let node = host;
  while (node) {
    if (node._penResolve) return node._penResolve;
    node = node.parentElement;
  }
  return null;
}

function hidePenBar(clearSelection = false) {
  document.querySelector(".pen-bar")?.classList.remove("is-on", "is-erase", "is-top", "is-side");
  if (clearSelection) {
    active = null;
    window.getSelection()?.removeAllRanges();
  }
}

function hostFromRange(range) {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return el?.closest("[data-pen-field]");
}

function markFromRange(range) {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return el?.closest(".pen-mark") || null;
}

function caretOffset(host, container, offset) {
  if (!host.contains(container) && container !== host) return 0;
  if (container === host) {
    let pos = 0;
    for (let i = 0; i < offset && i < host.childNodes.length; i += 1) {
      pos += nodeLength(host.childNodes[i]);
    }
    return pos;
  }
  let pos = 0;
  let done = false;
  const walk = (node) => {
    if (done) return;
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) pos += offset;
      else {
        for (let i = 0; i < offset && i < node.childNodes.length; i += 1) {
          pos += nodeLength(node.childNodes[i]);
        }
      }
      done = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) pos += node.nodeValue.length;
    else if (node.nodeName === "BR") pos += 1;
    else {
      for (const child of node.childNodes) walk(child);
    }
  };
  for (const child of host.childNodes) walk(child);
  return pos;
}

function nodeLength(node) {
  if (!node) return 0;
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.length;
  if (node.nodeName === "BR") return 1;
  let total = 0;
  for (const child of node.childNodes) total += nodeLength(child);
  return total;
}

export function collectHighlightSnippets(lessons) {
  const rows = [];
  for (const lesson of lessons || []) {
    for (const item of lesson.expressions || []) {
      for (const field of ["example", "exampleKo"]) {
        const text = String(item[field] || "");
        const key = field === "exampleKo" ? "exampleKoHighlights" : "exampleHighlights";
        for (const range of validRanges(text, item[key])) {
          const snippet = text.slice(range.start, range.end).replace(/\s+/g, " ").trim();
          if (!snippet) continue;
          rows.push({
            snippet,
            phrase: item.phrase || "",
            meaning: item.meaning || item.note || "",
            item,
            lesson,
            field,
            start: range.start,
            end: range.end,
            at: range.at || item.updatedAt || item.createdAt || lesson.updatedAt || lesson.studiedAt || "",
          });
        }
      }
    }
  }
  return rows.sort((a, b) => timeOf(b.at) - timeOf(a.at));
}

function timeOf(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function validRanges(text, ranges) {
  const len = String(text || "").length;
  return (ranges || [])
    .map((range) => ({
      start: Math.max(0, Number(range.start) || 0),
      end: Math.min(len, Number(range.end) || 0),
      at: range.at || "",
    }))
    .filter((range) => range.end > range.start);
}

function mergeRanges(ranges) {
  const merged = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      if ((range.at || "") > (last.at || "")) last.at = range.at;
    } else {
      merged.push({ start: range.start, end: range.end, at: range.at || "" });
    }
  }
  return merged;
}

function subtractRange(ranges, cut, text) {
  const out = [];
  for (const range of validRanges(text, ranges)) {
    if (range.end <= cut.start || range.start >= cut.end) {
      out.push(range);
      continue;
    }
    if (range.start < cut.start) out.push({ start: range.start, end: cut.start, at: range.at || "" });
    if (range.end > cut.end) out.push({ start: cut.end, end: range.end, at: range.at || "" });
  }
  return out;
}

function wrapRanges(text, ranges) {
  if (!ranges.length) return escapeHtml(text);
  const merged = mergeRanges(ranges);
  let out = "";
  let cursor = 0;
  for (const range of merged) {
    out += escapeHtml(text.slice(cursor, range.start));
    out += `<mark class="review-mark pen-mark" data-pen-start="${range.start}" data-pen-end="${range.end}">${escapeHtml(
      text.slice(range.start, range.end)
    )}</mark>`;
    cursor = range.end;
  }
  return out + escapeHtml(text.slice(cursor));
}
