import { getAllLessons, saveLesson } from "../storage/lessons.js?v=20260906s";
import { normalizeExpressions } from "../services/parser.js?v=20260825b";
import {
  loadReviewBookmark,
  loadReviewListState,
  saveReviewBookmark,
  saveReviewJump,
  saveReviewListState,
} from "../storage/reviewJump.js?v=20260906n";
import { rememberDeletedIds } from "../storage/lessonMerge.js?v=20260906s";
import { askConfirm } from "../ui/confirm.js?v=20260816p";
import { openExampleEditor, openExampleFinder } from "../ui/examplePanel.js?v=20260823e";
import { bindExamplePen, collectHighlightSnippets, remapHighlights, renderPenText } from "../ui/penHighlight.js?v=20260823o";
import { escapeHtml, formatDate, go, nl2br, toast } from "../utils.js?v=20260816p";

export async function renderReview(el) {
  const lessons = await getAllLessons();

  for (const lesson of lessons) {
    lesson.expressions = normalizeExpressions(lesson.expressions || []);
    for (const item of lesson.expressions) {
      if (!item.updatedAt && !item.createdAt) {
        item.createdAt = lesson.createdAt || lesson.studiedAt || "";
      }
    }
  }

  const countTab = (tab) => collect(lessons, tab).length;
  let bookmark = loadReviewBookmark();

  el.innerHTML = `
    <div class="review-page">
      <div class="review-jump-bar" role="toolbar" aria-label="복습 목록 이동">
        <button type="button" class="review-jump-btn" data-review-jump="top">맨 위로</button>
        <button type="button" class="review-jump-btn" data-review-jump="middle">중간으로</button>
        <button type="button" class="review-jump-btn" data-review-jump="bottom">맨 아래로</button>
        <button type="button" class="review-jump-btn" data-review-jump="bookmark">책갈피로</button>
      </div>
      <p class="lead">중요 표현을 모아서 복습할 수 있습니다.</p>
      <div class="review-toolbar">
        <div class="tabs">
          <button class="tab is-active" data-tab="expressions">중요 표현 (${countTab("expressions")})</button>
        </div>
        <div class="filters">
          <button class="chip is-active" data-filter="all">전체</button>
          <button class="chip" data-filter="starred">즐겨찾기</button>
          <button class="chip" data-filter="highlights">형광펜 강조부위</button>
        </div>
      </div>
      <div id="review-list"></div>
    </div>
  `;

  let tab = "expressions";
  let filter = "all";
  const saved = loadReviewListState();
  if (saved?.filter === "starred" || saved?.filter === "all" || saved?.filter === "highlights") {
    filter = saved.filter;
  }
  let focusId = saved?.itemId || "";
  let didRestore = false;

  const persist = (itemId = focusId) => {
    focusId = itemId || focusId;
    const list = el.querySelector("#review-list");
    saveReviewListState({
      tab,
      filter,
      scroll: list?.scrollTop || 0,
      itemId: focusId,
    });
  };

  const scrollToCard = (itemId, { toastMissing = false } = {}) => {
    const list = el.querySelector("#review-list");
    if (!list || !itemId) return false;
    const card = list.querySelector(`[data-review-item="${itemId}"]`);
    if (!card) {
      if (toastMissing) toast("책갈피한 표현이 이 목록에 없습니다.");
      return false;
    }
    list.querySelectorAll(".item-card.is-review-focus").forEach((node) => node.classList.remove("is-review-focus"));
    card.classList.add("is-review-focus");
    card.scrollIntoView({ block: "center" });
    persist(itemId);
    return true;
  };

  const jumpList = (where) => {
    const list = el.querySelector("#review-list");
    if (!list) return;
    const cards = [...list.querySelectorAll("[data-review-item]")];
    if (!cards.length) {
      if (where === "bookmark") toast("책갈피를 먼저 눌러 주세요.");
      return;
    }
    if (where === "top") {
      list.scrollTop = 0;
      cards[0]?.classList.add("is-review-focus");
      persist(cards[0]?.getAttribute("data-review-item") || "");
      return;
    }
    if (where === "bottom") {
      const last = cards[cards.length - 1];
      list.scrollTop = list.scrollHeight;
      last?.scrollIntoView({ block: "end" });
      persist(last?.getAttribute("data-review-item") || "");
      return;
    }
    if (where === "middle") {
      const mid = cards[Math.floor(cards.length / 2)];
      if (!mid) return;
      list.querySelectorAll(".item-card.is-review-focus").forEach((node) => node.classList.remove("is-review-focus"));
      mid.classList.add("is-review-focus");
      mid.scrollIntoView({ block: "center" });
      persist(mid.getAttribute("data-review-item") || "");
      return;
    }
    if (where === "bookmark") {
      if (!bookmark?.itemId) {
        toast("책갈피를 먼저 눌러 주세요.");
        return;
      }
      scrollToCard(bookmark.itemId, { toastMissing: true });
    }
  };

  el.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  el.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.filter === filter);
  });

  const draw = () => {
    const marks = collectHighlightSnippets(lessons);
    const markChip = el.querySelector("[data-filter='highlights']");
    if (markChip) markChip.textContent = `형광펜 강조부위 (${marks.length})`;
    const source = collect(lessons, tab);
    const items = source.filter((row) => {
      if (filter === "all") return true;
      if (filter === "highlights") return false;
      return isStarred(row.item, tab);
    });
    const list = el.querySelector("#review-list");
    const tabBtn = el.querySelector("[data-tab='expressions']");
    if (tabBtn) tabBtn.textContent = `중요 표현 (${countTab("expressions")})`;
    const keepScroll = list?.scrollTop || 0;
    if (filter === "highlights") {
      if (!marks.length) {
        list.innerHTML = `<div class="empty">형광펜으로 칠한 부분이 없습니다. 예문에서 문장을 지정한 뒤 형광펜을 칠하면 여기에 모입니다.</div>`;
        return;
      }
      list.innerHTML = `<div class="stack">${marks.map(highlightCard).join("")}</div>`;
      if (!didRestore) {
        didRestore = true;
        restorePlace(list, saved);
      } else {
        list.scrollTop = keepScroll;
      }
      return;
    }
    if (!items.length) {
      list.innerHTML = `<div class="empty">${
        filter === "starred" ? "별표를 친 항목이 없습니다." : "표시할 항목이 없습니다."
      }</div>`;
      return;
    }
    list.innerHTML = `<div class="stack">${items
      .map((row) => {
        const { item, lesson } = row;
        const meaning = item.meaning || item.note || "";
        const starred = isStarred(item, tab);
        const bookmarked = bookmark?.itemId === item.id;
        return `
          <article class="card item-card ${bookmarked ? "is-bookmarked" : ""}" data-review-item="${escapeHtml(item.id)}">
            <div class="item-en">${nl2br(item.phrase)}</div>
            <div class="item-ko">${nl2br(meaning)}</div>
            ${item.example ? `<div class="item-example" data-pen-field="example" data-pen-item="${escapeHtml(item.id)}" data-pen-lesson="${escapeHtml(lesson.id)}">${renderPenText(item.example, item.exampleHighlights)}</div>` : ""}
            ${item.exampleKo ? `<div class="item-example-ko" data-pen-field="exampleKo" data-pen-item="${escapeHtml(item.id)}" data-pen-lesson="${escapeHtml(lesson.id)}">${renderPenText(item.exampleKo, item.exampleKoHighlights)}</div>` : ""}
            <div class="muted">${escapeHtml(lesson.bookTitle)} · ${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)} · ${formatDate(lesson.studiedAt)}</div>
            <div class="item-actions">
              <button type="button" class="text-btn" data-open-page="${escapeHtml(lesson.id)}" data-item="${escapeHtml(item.id)}">페이지로</button>
              <button type="button" class="text-btn danger" data-remove-expression="${escapeHtml(lesson.id)}" data-item="${escapeHtml(item.id)}">지우기</button>
              <button type="button" class="icon-bookmark ${bookmarked ? "is-on" : ""}" data-bookmark="${escapeHtml(lesson.id)}" data-item="${escapeHtml(item.id)}" aria-label="책갈피" title="책갈피">${bookmarked ? "책갈피됨" : "책갈피"}</button>
              <button class="icon-star ${starred ? "is-on" : ""}" data-toggle="${lesson.id}:${item.id}:${tab}">${starred ? "★" : "☆"}</button>
            </div>
            <div class="item-extra-actions">
              <button type="button" class="text-btn" data-find-example="${escapeHtml(lesson.id)}" data-item="${escapeHtml(item.id)}">예문찾기</button>
              <button type="button" class="text-btn" data-edit-example="${escapeHtml(lesson.id)}" data-item="${escapeHtml(item.id)}">예문 등록</button>
            </div>
          </article>`;
      })
      .join("")}</div>`;
    if (!didRestore) {
      didRestore = true;
      restorePlace(list, saved);
    } else {
      list.scrollTop = keepScroll;
    }
  };

  const restorePlace = (list, state) => {
    if (!list || !state) return;
    if (state.itemId) {
      const card = list.querySelector(`[data-review-item="${state.itemId}"]`);
      if (card) {
        card.classList.add("is-review-focus");
        card.scrollIntoView({ block: "center" });
        return;
      }
    }
    if (Number.isFinite(state.scroll)) list.scrollTop = state.scroll;
  };

  el.querySelectorAll("[data-review-jump]").forEach((btn) => {
    btn.addEventListener("click", () => jumpList(btn.getAttribute("data-review-jump") || ""));
  });

  el.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("is-active", b === btn));
      persist();
      draw();
      el.querySelector("#review-list").scrollTop = 0;
    });
  });

  el.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      el.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b === btn));
      persist();
      draw();
      el.querySelector("#review-list").scrollTop = 0;
    });
  });

  el.querySelector("#review-list")?.addEventListener("scroll", () => persist());

  el.addEventListener("click", async (event) => {
    const open = event.target.closest("[data-open-page]");
    if (open) {
      const lessonId = open.getAttribute("data-open-page") || "";
      const itemId = open.getAttribute("data-item") || "";
      const source = collect(lessons, tab);
      const row = source.find((entry) => entry.item.id === itemId && entry.lesson.id === lessonId);
      persist(itemId);
      saveReviewJump({
        lessonId,
        itemId,
        phrase: row?.item?.phrase || "",
        tab,
      });
      go(`#/lesson/${encodeURIComponent(lessonId)}?from=review`);
      return;
    }
    const bookmarkBtn = event.target.closest("[data-bookmark]");
    if (bookmarkBtn) {
      const lessonId = bookmarkBtn.getAttribute("data-bookmark") || "";
      const itemId = bookmarkBtn.getAttribute("data-item") || "";
      const lesson = lessons.find((row) => row.id === lessonId);
      const item = (lesson?.expressions || []).find((row) => row.id === itemId);
      if (!item) return;
      if (bookmark?.itemId === itemId) {
        bookmark = null;
        saveReviewBookmark(null);
        toast("책갈피를 해제했습니다.");
      } else {
        const moved = Boolean(bookmark?.itemId);
        bookmark = { itemId, lessonId, phrase: item.phrase || "" };
        saveReviewBookmark(bookmark);
        toast(moved ? "책갈피를 이곳으로 옮겼습니다." : "책갈피를 꽂았습니다.");
      }
      draw();
      return;
    }
    const remove = event.target.closest("[data-remove-expression]");
    if (remove) {
      const lessonId = remove.getAttribute("data-remove-expression") || "";
      const itemId = remove.getAttribute("data-item") || "";
      const lesson = lessons.find((row) => row.id === lessonId);
      if (!lesson) return;
      const item = (lesson.expressions || []).find((row) => row.id === itemId);
      if (!item) return;
      const ok = await askConfirm("이미 아는 표현은 목록에서 지울 수 있습니다. 이 표현을 중요 표현에서 삭제할까요?");
      if (!ok) return;
      const prev = lesson.expressions;
      lesson.expressions = prev.filter((row) => row.id !== itemId);
      rememberDeletedIds(lesson, [itemId]);
      lesson.updatedAt = new Date().toISOString();
      try {
        await saveLesson(lesson);
        toast("중요 표현에서 지웠습니다.");
        if (focusId === itemId) focusId = "";
        if (bookmark?.itemId === itemId) {
          bookmark = null;
          saveReviewBookmark(null);
        }
        persist();
        draw();
      } catch (error) {
        console.error(error);
        lesson.expressions = prev;
        toast("삭제하지 못했습니다. 다시 시도해 주세요.");
      }
      return;
    }
    const findEx = event.target.closest("[data-find-example]");
    if (findEx) {
      const lessonId = findEx.getAttribute("data-find-example") || "";
      const itemId = findEx.getAttribute("data-item") || "";
      const lesson = lessons.find((row) => row.id === lessonId);
      const item = (lesson?.expressions || []).find((row) => row.id === itemId);
      if (!item) return;
      openExampleFinder({
        phrase: item.phrase,
        meaning: item.meaning,
        lessons,
      });
      return;
    }
    const editEx = event.target.closest("[data-edit-example]");
    if (editEx) {
      const lessonId = editEx.getAttribute("data-edit-example") || "";
      const itemId = editEx.getAttribute("data-item") || "";
      const lesson = lessons.find((row) => row.id === lessonId);
      const item = (lesson?.expressions || []).find((row) => row.id === itemId);
      if (!item) return;
      const result = await openExampleEditor({
        phrase: item.phrase,
        example: item.example || "",
        exampleKo: item.exampleKo || "",
      });
      if (!result) return;
      const prevExample = item.example;
      const prevKo = item.exampleKo;
      const prevMarks = item.exampleHighlights;
      const prevKoMarks = item.exampleKoHighlights;
      item.example = result.example;
      item.exampleKo = result.exampleKo;
      item.exampleHighlights = remapHighlights(prevExample, item.example, item.exampleHighlights);
      item.exampleKoHighlights = remapHighlights(prevKo, item.exampleKo, item.exampleKoHighlights);
      item.updatedAt = new Date().toISOString();
      lesson.updatedAt = item.updatedAt;
      try {
        await saveLesson(lesson);
        toast("예문을 등록했습니다.");
        persist(itemId);
        draw();
      } catch (error) {
        console.error(error);
        item.example = prevExample;
        item.exampleKo = prevKo;
        item.exampleHighlights = prevMarks;
        item.exampleKoHighlights = prevKoMarks;
        toast("저장하지 못했습니다. 다시 시도해 주세요.");
      }
      return;
    }
    const toggle = event.target.closest("[data-toggle]");
    if (!toggle) return;
    const [lessonId, itemId, kind] = toggle.dataset.toggle.split(":");
    const lesson = lessons.find((row) => row.id === lessonId);
    if (!lesson) return;
    const list = kind === "expressions" ? lesson.expressions : lesson.listeningPoints;
    const item = list.find((row) => row.id === itemId);
    if (!item) return;
    if (kind === "expressions") item.favorite = !item.favorite;
    else item.difficult = !item.difficult;
    lesson.updatedAt = new Date().toISOString();
    await saveLesson(lesson);
    draw();
  });

  let pendingRank = null;

  const promotePending = async () => {
    const prev = pendingRank;
    if (!prev?.item) return;
    pendingRank = null;
    const now = new Date().toISOString();
    prev.item.updatedAt = now;
    if (prev.lesson) prev.lesson.updatedAt = now;
    try {
      await saveLesson(prev.lesson);
    } catch (error) {
      console.warn(error);
    }
  };

  bindExamplePen({
    root: el,
    resolve: (host) => {
      const lesson = lessons.find((row) => row.id === host.getAttribute("data-pen-lesson"));
      const item = (lesson?.expressions || []).find((row) => row.id === host.getAttribute("data-pen-item"));
      if (!item) return null;
      return { item, lesson, deferRank: true, save: () => saveLesson(lesson) };
    },
    onChange: async ({ item, lesson } = {}) => {
      if (item && pendingRank && pendingRank.item.id !== item.id) {
        await promotePending();
      }
      if (item) pendingRank = { item, lesson };
      draw();
      if (item && filter !== "highlights") {
        window.requestAnimationFrame(() => {
          el.querySelector(`[data-review-item="${item.id}"]`)?.scrollIntoView({ block: "nearest" });
        });
      }
    },
    onUnbind: () => {
      promotePending();
    },
  });

  draw();
}

function collect(lessons, tab) {
  const rows = [];
  for (const lesson of lessons) {
    const list = tab === "expressions" ? lesson.expressions || [] : lesson.listeningPoints || [];
    list.forEach((item, index) => {
      rows.push({ item, lesson, index });
    });
  }
  return rows.sort((a, b) => {
    const byTime = recencyOf(b) - recencyOf(a);
    if (byTime !== 0) return byTime;
    return b.index - a.index;
  });
}

function recencyOf(row) {
  const raw =
    row.item?.updatedAt ||
    row.item?.createdAt ||
    row.lesson?.createdAt ||
    row.lesson?.studiedAt ||
    "";
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function isStarred(item, tab) {
  if (tab === "expressions") return Boolean(item.favorite);
  return Boolean(item.difficult);
}

function highlightCard(row) {
  const { item, lesson, snippet } = row;
  return `
    <article class="card item-card" data-review-item="${escapeHtml(item.id)}">
      <div class="item-example" data-pen-field="${escapeHtml(row.field)}" data-pen-item="${escapeHtml(item.id)}" data-pen-lesson="${escapeHtml(lesson.id)}" data-pen-snippet="1"><mark class="review-mark pen-mark" data-pen-start="${row.start}" data-pen-end="${row.end}">${escapeHtml(snippet)}</mark></div>
      <div class="item-en">${nl2br(item.phrase)}</div>
      <div class="item-ko">${nl2br(row.meaning)}</div>
      <div class="muted">${escapeHtml(lesson.bookTitle)} · ${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)} · ${formatDate(row.at || lesson.studiedAt)}</div>
      <div class="item-actions">
        <button type="button" class="text-btn" data-open-page="${escapeHtml(lesson.id)}" data-item="${escapeHtml(item.id)}">페이지로</button>
      </div>
    </article>`;
}
