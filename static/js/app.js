import { stopAudio } from "./services/audioPlayer.js?v=20260818a";
import { closeLightbox, isLightboxOpen } from "./pages/lightbox.js?v=20260816w";
import { renderHome } from "./pages/home.js?v=20260826a";
import { renderBooks, renderBookDetail } from "./pages/books.js?v=20260825c";
import { renderLesson } from "./pages/lesson.js?v=20260825c";
import { renderCompare } from "./pages/compare.js?v=20260825c";
import { renderAdd } from "./pages/add.js?v=20260825c";
import { renderReview } from "./pages/review.js?v=20260825c";
import { renderSearch } from "./pages/search.js?v=20260825c";
import { isListenPlaying, renderListen, stopListenSession } from "./pages/listen.js?v=20260825c";
import { go, toast, escapeHtml } from "./utils.js?v=20260816p";

export async function renderApp(route) {
  stopListenSession();
  stopAudio();
  closeLightbox();
  if (history.state?.lightbox) {
    history.replaceState(null, "", location.href);
  }

  const app = document.getElementById("app");
  const actionBar = route.name === "lesson" || route.name === "edit" || route.name === "add";
  const lessonPage = route.name === "lesson";
  const listenPage = route.name === "listen" || route.name === "listenBook";
  const reviewPage = route.name === "review";
  const searchPage = route.name === "search";
  document.documentElement.classList.toggle("lesson-wide", lessonPage);
  document.documentElement.classList.toggle("listen-wide", listenPage);
  document.documentElement.classList.toggle("review-lock", reviewPage || searchPage);
  document.body.classList.toggle("review-lock", reviewPage || searchPage);
  app.innerHTML = `
    <div class="shell ${actionBar ? "shell-has-actions" : ""} ${lessonPage ? "shell-lesson" : ""} ${listenPage ? "shell-listen" : ""} ${reviewPage ? "shell-review" : ""} ${searchPage ? "shell-search" : ""}">
      ${topbarMarkup(route)}
      <main class="content" id="content"></main>
      <nav class="bottom-nav" ${route.name === "compare" ? "hidden" : ""}>
        <button class="nav-item ${route.name === "home" ? "is-active" : ""}" data-go="#/">
          ${navIcon("home")}
          최근 학습
        </button>
        <button class="nav-item ${route.name === "books" || route.name === "book" ? "is-active" : ""}" data-go="#/books">
          ${navIcon("books")}
          책
        </button>
        <button class="nav-item nav-add ${route.name === "add" ? "is-active" : ""}" data-go="#/lesson/new">
          ${navPlus()}
          추가
        </button>
        <button class="nav-item ${route.name === "review" ? "is-active" : ""}" data-go="#/review">
          ${navIcon("review")}
          복습
        </button>
        <button class="nav-item ${searchPage ? "is-active" : ""}" data-go="#/search">
          ${navIcon("search")}
          검색
        </button>
        <button class="nav-item ${listenPage ? "is-active" : ""}" data-go="#/listen">
          ${navIcon("listen")}
          연속듣기
        </button>
      </nav>
    </div>
  `;

  app.querySelector("[data-full-edit]")?.addEventListener("click", () => {
    if (route.name === "edit") return;
    const href = app.querySelector("[data-full-edit]")?.getAttribute("data-full-edit");
    if (href) go(href);
  });

  app.querySelector("[data-top-save]")?.addEventListener("click", () => clickTopSave(route));

  app.querySelector("[data-action='back']")?.addEventListener("click", () => {
    if (isLightboxOpen()) {
      history.back();
      return;
    }
    if (route.name === "compare") {
      location.hash = `#/lesson/${encodeURIComponent(route.id)}`;
      return;
    }
    if (route.name === "listenBook" && isListenPlaying()) {
      stopListenSession();
      stopAudio();
      const panel = document.getElementById("content");
      if (panel) renderListen(panel, route);
      return;
    }
    if (window.history.length > 1) window.history.back();
    else location.hash = "#/";
  });

  const content = document.getElementById("content");
  const isCompare = route.name === "compare";
  document.documentElement.classList.toggle("compare-lock", isCompare);
  document.body.classList.toggle("compare-lock", isCompare);
  app.querySelector(".shell")?.classList.toggle("shell-compare", isCompare);
  content.classList.toggle("content-compare", isCompare);
  content.classList.toggle("content-review", reviewPage || searchPage);
  try {
    if (route.name === "home") await renderHome(content);
    else if (route.name === "books") await renderBooks(content);
    else if (route.name === "book") await renderBookDetail(content, route.title);
    else if (route.name === "lesson") await renderLesson(content, route.id);
    else if (route.name === "compare") await renderCompare(content, route.id);
    else if (route.name === "add") await renderAdd(content, null);
    else if (route.name === "edit") await renderAdd(content, route.id);
    else if (route.name === "review") await renderReview(content);
    else if (route.name === "search") await renderSearch(content);
    else if (route.name === "listen" || route.name === "listenBook") await renderListen(content, route);
    else await renderHome(content);
  } catch (error) {
    console.error(error);
    content.innerHTML = `<div class="empty">화면을 불러오지 못했습니다.</div>`;
  }
}

function backButton() {
  return `<button type="button" class="icon-btn topbar-back" data-action="back" aria-label="이전 페이지로 돌아가기">${backArrow()}</button>`;
}

function backArrow() {
  return `<svg class="topbar-back-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 3.8 5.6 12l9.8 8.2" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function topbarMarkup(route) {
  if (route.name === "lesson" || route.name === "edit" || route.name === "add") {
    const editHref = route.id ? `#/lesson/${encodeURIComponent(route.id)}/edit` : "";
    const editing = route.name === "edit";
    return `
      <header class="topbar topbar-sticky-actions">
        ${backButton()}
        ${
          editHref
            ? `<button type="button" class="btn btn-ghost topbar-action ${editing ? "is-current" : ""}" data-full-edit="${editHref}">전체 수정</button>`
            : `<div class="topbar-title">새 학습자료</div>`
        }
        <button type="button" class="btn btn-primary topbar-action" data-top-save>저장</button>
      </header>
    `;
  }

  const title = headerTitle(route);
  return `
    <header class="topbar">
      ${route.name === "home" ? "" : backButton()}
      <div class="topbar-text">
        <div class="topbar-title">${title}</div>
      </div>
    </header>
  `;
}

function clickTopSave(route) {
  const saveLesson = document.getElementById("save-lesson");
  if (saveLesson) {
    if (saveLesson.disabled) return;
    saveLesson.click();
    return;
  }
  const saveTranslation = document.getElementById("save-translation");
  if (saveTranslation) {
    saveTranslation.click();
    return;
  }
  const metaForm = document.getElementById("lesson-meta-form");
  if (metaForm?.classList.contains("is-open")) {
    metaForm.requestSubmit();
    return;
  }
  if (route.name === "lesson") {
    toast("먼저 전체 수정을 눌러 해석 등을 넣은 뒤 저장하세요.");
    return;
  }
  toast("저장할 내용이 없습니다.");
}

function navIcon(name) {
  const paths = {
    home: `<rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" />`,
    books: `<path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />`,
    review: `<path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><path d="M17 3.8V8h4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`,
    search: `<circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" stroke-width="2" /><path d="M15.8 15.8L21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />`,
    listen: `<path d="M4 6.2l8.2 5.8L4 17.8V6.2zM12.2 6.2L20.4 12l-8.2 5.8V6.2z" fill="currentColor" />`,
  };
  return `<span class="nav-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[name] || ""}</svg></span>`;
}

function navPlus() {
  return `<span class="nav-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" /></svg></span>`;
}

function headerTitle(route) {
  if (route.name === "home") return "English Listening Reader";
  if (route.name === "books") return "책";
  if (route.name === "book") return route.title;
  if (route.name === "lesson") return "리스닝";
  if (route.name === "compare") return "원본과 해석";
  if (route.name === "add") return "새 학습자료";
  if (route.name === "edit") return "학습자료 수정";
  if (route.name === "review") return "복습";
  if (route.name === "search") return "검색";
  if (route.name === "listen") return "연속듣기";
  if (route.name === "listenBook") return escapeHtml(route.title || "연속듣기");
  return "English Listening Reader";
}
