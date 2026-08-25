import { getAllLessons, getLessonsByBook, groupBooks, groupByChapter, hasAudio, renameBook, renameChapter } from "../storage/lessons.js?v=20260825c";
import { addBookTitle, addChapter, getChaptersForBook, getStoredBookTitles, removeChapter } from "../storage/books.js?v=20260816w";
import { scriptPreview } from "./home.js?v=20260825c";
import { escapeHtml, formatDate, toast } from "../utils.js?v=20260816p";

export async function renderBooks(el) {
  const lessons = await getAllLessons();
  const storedTitles = await getStoredBookTitles();
  const books = groupBooks(lessons, storedTitles);

  el.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>책</h2>
        <button type="button" class="text-btn" id="open-add-book">+ 추가</button>
      </div>
      <p class="hint">잘못 만든 제목은 여기서 수정하거나 삭제하면 선택 목록에서 사라집니다.</p>
      <form class="title-editor book-add-form" id="add-book-form">
        <label>
          새 책 제목
          <input id="add-book-input" enterkeyhint="done" autocomplete="off" placeholder="예: Harry Potter" />
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          <button type="button" class="btn btn-ghost" id="cancel-add-book">취소</button>
        </div>
      </form>
      ${
        books.length
          ? `<div class="stack">${books
              .map(
                (book) => `
            <div class="card book-card">
              <a class="lesson-card-link" href="#/books/${encodeURIComponent(book.title)}">
                <div class="book-title">${escapeHtml(book.title)}</div>
                <div class="muted">${book.count} pages studied${book.completed ? ` · ✓ ${book.completed}` : ""}</div>
              </a>
              <div class="card-side-actions">
                <button type="button" class="text-btn" data-edit-book="${escapeHtml(book.title)}">수정</button>
                <button type="button" class="btn-delete" data-delete-book="${escapeHtml(book.title)}">삭제</button>
              </div>
              <form class="title-editor meta-editor lesson-card-title-form" data-book-rename-form="${escapeHtml(book.title)}">
                <label>
                  책 제목
                  <input enterkeyhint="done" autocomplete="off" data-book-rename-input value="${escapeHtml(book.title)}" />
                </label>
                <p class="hint">이 책의 모든 페이지 제목이 함께 바뀝니다.</p>
                <div class="form-actions">
                  <button type="submit" class="btn btn-play">저장</button>
                  <button type="button" class="btn btn-ghost" data-cancel-book-rename>취소</button>
                </div>
              </form>
            </div>`
              )
              .join("")}</div>`
          : `<div class="empty">아직 책이 없습니다. 위의 + 추가로 책 제목을 만들어 보세요.</div>`
      }
    </section>
  `;

  const form = el.querySelector("#add-book-form");
  const input = el.querySelector("#add-book-input");

  el.querySelector("#open-add-book")?.addEventListener("click", () => {
    form?.classList.add("is-open");
    input?.focus();
    form?.scrollIntoView({ block: "nearest" });
  });

  el.querySelector("#cancel-add-book")?.addEventListener("click", () => {
    form?.classList.remove("is-open");
    if (input) input.value = "";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = String(input?.value || "").trim();
    if (!title) {
      toast("책 제목을 입력해 주세요.");
      input?.focus();
      return;
    }
    const exists = books.some((book) => book.title.toLowerCase() === title.toLowerCase());
    if (exists) {
      toast("이미 있는 책 제목입니다.");
      return;
    }
    try {
      const result = await addBookTitle(title);
      toast(result.created ? "책 제목을 추가했습니다." : "이미 있는 책 제목입니다.");
      await renderBooks(el);
    } catch (error) {
      console.error(error);
      toast("책 제목을 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  });

  el.querySelectorAll("[data-edit-book]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-edit-book") || "";
      el.querySelectorAll("[data-book-rename-form]").forEach((renameForm) => {
        renameForm.classList.toggle("is-open", renameForm.getAttribute("data-book-rename-form") === name);
      });
      const renameForm = [...el.querySelectorAll("[data-book-rename-form]")].find(
        (node) => node.getAttribute("data-book-rename-form") === name
      );
      renameForm?.querySelector("[data-book-rename-input]")?.focus();
    });
  });

  el.querySelectorAll("[data-cancel-book-rename]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest("[data-book-rename-form]")?.classList.remove("is-open");
    });
  });

  el.querySelectorAll("[data-book-rename-form]").forEach((renameForm) => {
    renameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const prev = renameForm.getAttribute("data-book-rename-form") || "";
      const next = String(renameForm.querySelector("[data-book-rename-input]")?.value || "").trim();
      if (!next) {
        toast("책 제목을 입력해 주세요.");
        return;
      }
      try {
        await renameBook(prev, next);
        toast("책 제목을 수정했습니다.");
        await renderBooks(el);
      } catch (error) {
        console.error(error);
        toast("제목을 수정하지 못했습니다. 다시 시도해 주세요.");
      }
    });
  });
}

export async function renderBookDetail(el, title) {
  const lessons = await getLessonsByBook(title);
  const storedChapters = await getChaptersForBook(title);
  const chapters = groupByChapter(lessons, storedChapters);

  el.innerHTML = `
    <section class="hero-min">
      <h1 id="book-title-text">${escapeHtml(title)}</h1>
      <p class="muted">${lessons.length} pages studied</p>
      <button type="button" class="btn btn-ghost btn-wide" data-edit-title="${escapeHtml(title)}">이 책의 제목 수정</button>
      <form class="title-editor" id="book-title-form" data-old-title="${escapeHtml(title)}">
        <p class="hint">이 책에 속한 모든 페이지의 제목이 함께 바뀝니다. 한 페이지만 바꾸려면 해당 학습 페이지에서 수정하세요.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-play" data-save-title data-old-title="${escapeHtml(title)}">저장</button>
          <button type="button" class="btn btn-ghost" data-cancel-title>취소</button>
        </div>
        <label>
          책 제목
          <input id="book-title-input" enterkeyhint="done" autocomplete="off" value="${escapeHtml(title)}" />
        </label>
      </form>
      <div class="section-head chapter-toolbar">
        <h2>챕터</h2>
        <button type="button" class="text-btn" id="open-add-chapter">+ 챕터 추가</button>
      </div>
      <form class="title-editor meta-editor" id="add-chapter-form">
        <label>
          새 챕터 이름
          <input id="add-chapter-input" enterkeyhint="done" autocomplete="off" placeholder="예: Chapter 1" />
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          <button type="button" class="btn btn-ghost" id="cancel-add-chapter">취소</button>
        </div>
      </form>
    </section>
    ${
      chapters.length
        ? chapters
            .map(
              ([chapter, pages]) => `
        <section class="section">
          <div class="section-head chapter-head">
            <h2 class="chapter-title">${escapeHtml(chapter)}</h2>
            <button type="button" class="text-btn" data-edit-chapter="${escapeHtml(chapter)}">수정</button>
          </div>
          <form class="title-editor meta-editor" data-chapter-form="${escapeHtml(chapter)}">
            <label>
              챕터 이름
              <input enterkeyhint="done" autocomplete="off" data-chapter-input value="${escapeHtml(chapter)}" />
            </label>
            <div class="form-actions">
              <button type="submit" class="btn btn-play">저장</button>
              <button type="button" class="btn btn-ghost" data-cancel-chapter>취소</button>
            </div>
          </form>
          ${
            pages.length
              ? `<div class="stack">
            ${pages
              .map(
                (lesson) => `
              <div class="card lesson-card">
                <a class="lesson-card-link" href="#/lesson/${encodeURIComponent(lesson.id)}">
                  <div class="lesson-card-top">
                    <div class="lesson-line">${lesson.completed ? "✓ " : ""}Page ${escapeHtml(lesson.page)}${hasAudio(lesson) ? `<span class="audio-badge" title="오디오 있음">🎧</span>` : ""}</div>
                    <span class="muted">${formatDate(lesson.studiedAt || lesson.updatedAt)}</span>
                  </div>
                  ${scriptPreview(lesson.script)}
                </a>
                <div class="card-side-actions">
                  <button type="button" class="text-btn" data-edit-page-title="${escapeHtml(lesson.id)}">제목 수정</button>
                  <button type="button" class="btn-delete" data-delete-lesson="${escapeHtml(lesson.id)}">삭제</button>
                </div>
                <form class="title-editor meta-editor lesson-card-title-form" data-page-title-form="${escapeHtml(lesson.id)}">
                  <label>
                    이 페이지의 책 제목
                    <input enterkeyhint="done" autocomplete="off" data-page-title-input value="${escapeHtml(lesson.bookTitle)}" />
                  </label>
                  <p class="hint">이 페이지만 바뀝니다. 다른 학습자료는 그대로입니다.</p>
                  <div class="form-actions">
                    <button type="submit" class="btn btn-play">저장</button>
                    <button type="button" class="btn btn-ghost" data-cancel-page-title>취소</button>
                  </div>
                </form>
              </div>`
              )
              .join("")}
          </div>`
              : `<div class="empty">이 챕터의 학습자료가 없습니다.</div>
          <div class="form-actions">
            <button type="button" class="text-btn danger" data-delete-chapter="${escapeHtml(chapter)}">빈 챕터 삭제</button>
          </div>`
          }
        </section>`
            )
            .join("")
        : `<div class="empty">이 책의 챕터가 없습니다. 위의 + 챕터 추가로 만들어 보세요.</div>`
    }
    <div class="form-actions book-delete-row">
      <button type="button" class="btn btn-ghost danger" data-delete-book="${escapeHtml(title)}">이 책 삭제</button>
    </div>
  `;

  bindBookDetail(el, title, chapters);
}

function bindBookDetail(el, bookTitle, chapters) {
  const addForm = el.querySelector("#add-chapter-form");
  const addInput = el.querySelector("#add-chapter-input");

  el.querySelector("#open-add-chapter")?.addEventListener("click", () => {
    addForm?.classList.add("is-open");
    addInput?.focus();
    addForm?.scrollIntoView({ block: "nearest" });
  });

  el.querySelector("#cancel-add-chapter")?.addEventListener("click", () => {
    addForm?.classList.remove("is-open");
    if (addInput) addInput.value = "";
  });

  addForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const chapter = String(addInput?.value || "").trim();
    if (!chapter) {
      toast("챕터 이름을 입력해 주세요.");
      addInput?.focus();
      return;
    }
    const exists = chapters.some(([name]) => name.toLowerCase() === chapter.toLowerCase());
    if (exists) {
      toast("이미 있는 챕터입니다.");
      return;
    }
    try {
      const result = await addChapter(bookTitle, chapter);
      toast(result.created ? "챕터를 추가했습니다." : "이미 있는 챕터입니다.");
      await renderBookDetail(el, bookTitle);
    } catch (error) {
      console.error(error);
      toast("챕터를 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  });

  el.querySelectorAll("[data-edit-chapter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-edit-chapter") || "";
      el.querySelectorAll("[data-chapter-form]").forEach((form) => {
        form.classList.toggle("is-open", form.getAttribute("data-chapter-form") === name);
      });
      const form = [...el.querySelectorAll("[data-chapter-form]")].find(
        (node) => node.getAttribute("data-chapter-form") === name
      );
      form?.querySelector("[data-chapter-input]")?.focus();
    });
  });

  el.querySelectorAll("[data-cancel-chapter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest("form")?.classList.remove("is-open");
    });
  });

  el.querySelectorAll("[data-chapter-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const prev = form.getAttribute("data-chapter-form") || "";
      const next = String(form.querySelector("[data-chapter-input]")?.value || "").trim();
      if (!next) {
        toast("챕터 이름을 입력해 주세요.");
        return;
      }
      try {
        await renameChapter(bookTitle, prev, next);
        toast("챕터 이름을 수정했습니다.");
        await renderBookDetail(el, bookTitle);
      } catch (error) {
        console.error(error);
        toast("챕터를 수정하지 못했습니다. 다시 시도해 주세요.");
      }
    });
  });

  el.querySelectorAll("[data-delete-chapter]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const chapter = btn.getAttribute("data-delete-chapter") || "";
      if (!chapter) return;
      try {
        await removeChapter(bookTitle, chapter);
        toast("빈 챕터를 삭제했습니다.");
        await renderBookDetail(el, bookTitle);
      } catch (error) {
        console.error(error);
        toast("챕터를 삭제하지 못했습니다. 다시 시도해 주세요.");
      }
    });
  });
}
