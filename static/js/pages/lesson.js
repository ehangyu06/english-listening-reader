import { getAllLessons, getLesson, saveLesson, getLessonsByBook, getNeighbors, updateLessonMeta, getLessonImageIds } from "../storage/lessons.js?v=20260825c";
import { listBookTitles } from "../storage/books.js?v=20260816w";
import { getImage } from "../storage/images.js?v=20260825c";
import { parseScriptParts, parseExpressions, scriptForCopy, scriptPartKindLabel, normalizeExpressions } from "../services/parser.js?v=20260825b";
import { generateKoreanTranslation } from "../services/translation.js?v=20260816p";
import { audioPanelMarkup, bindAudioPanel } from "./audioPanel.js?v=20260827d";
import { openLightbox } from "./lightbox.js?v=20260816w";
import { openBookPicker } from "../ui/bookPicker.js?v=20260816y";
import { escapeHtml, formatDate, nl2br, toast, copyText, uid } from "../utils.js?v=20260816p";
import { isFromReview, readReviewJump } from "../storage/reviewJump.js?v=20260818g";
import { isFromSearch, readSearchJump } from "../storage/searchJump.js?v=20260818k";
import { askConfirm } from "../ui/confirm.js?v=20260816p";
import { openExampleEditor, openExampleFinder } from "../ui/examplePanel.js?v=20260823e";
import { markedText, markEscapedText } from "../ui/highlight.js?v=20260823d";
import { bindExamplePen, renderPenText, remapHighlights } from "../ui/penHighlight.js?v=20260823o";

const ui = {
  lessonId: "",
  hideScript: false,
  hideKorean: false,
  hideTranslation: false,
  editingTranslation: false,
  objectUrls: [],
};

export async function renderLesson(el, id) {
  const lesson = await getLesson(id);
  if (!lesson) {
    el.innerHTML = `<div class="empty">학습자료를 찾지 못했습니다.</div>`;
    return;
  }

  if (ui.lessonId !== id) {
    ui.lessonId = id;
    ui.hideScript = false;
    ui.hideKorean = false;
    ui.hideTranslation = false;
    ui.editingTranslation = false;
  }

  const allLessons = await getAllLessons();
  const bookTitles = (await listBookTitles(allLessons.map((item) => item.bookTitle))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  if (lesson.bookTitle && !bookTitles.includes(lesson.bookTitle)) bookTitles.unshift(lesson.bookTitle);
  const siblings = await getLessonsByBook(lesson.bookTitle);
  const { prev, next } = getNeighbors(siblings, lesson.id);
  const parts = parseScriptParts(lesson.script);
  for (const url of ui.objectUrls) URL.revokeObjectURL(url);
  ui.objectUrls = [];
  for (const imageId of getLessonImageIds(lesson)) {
    const image = await getImage(imageId);
    if (image?.blob) ui.objectUrls.push(URL.createObjectURL(image.blob));
  }

  lesson.expressions = normalizeExpressions(lesson.expressions || []);
  const fromReview = isFromReview();
  const fromSearch = isFromSearch();
  const jump = fromReview ? readReviewJump(id) : fromSearch ? readSearchJump(id) : null;
  if (fromReview || fromSearch) ui.hideScript = false;

  el.innerHTML = `
    ${
      fromReview
        ? `<div class="review-return-bar">
            <button type="button" class="btn btn-play" data-go="#/review">복습으로 돌아가기</button>
            <p class="hint">노란색 표시는 복습에서 들어올 때만 보입니다.</p>
          </div>`
        : fromSearch
          ? `<div class="review-return-bar">
            <button type="button" class="btn btn-play" data-go="#/search">검색으로 돌아가기</button>
            <p class="hint">노란 형광펜은 검색한 단어입니다.</p>
          </div>`
        : ""
    }
    <section class="lesson-head">
      <div class="title-row" id="book-title-row">
        <button type="button" class="title-pick-btn" id="open-book-pick">
          <h1 id="book-title-text">${escapeHtml(lesson.bookTitle)}</h1>
          <span class="title-pick-hint">제목 선택</span>
        </button>
      </div>
      <p class="lesson-meta" id="lesson-meta-text">${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)}</p>
      <button type="button" class="btn btn-ghost btn-wide" id="edit-lesson-meta">이 페이지의 책 · 챕터 · 페이지 수정</button>
      <form class="title-editor meta-editor" id="lesson-meta-form">
        <p class="hint">이 페이지만 바뀝니다. 다른 학습자료의 책 제목은 그대로입니다.</p>
        <label>
          책 제목
          <select id="lesson-book-input">
            ${bookTitles
              .map(
                (title) =>
                  `<option value="${escapeHtml(title)}" ${title === lesson.bookTitle ? "selected" : ""}>${escapeHtml(title)}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="form-row">
          <label>
            Chapter
            <input id="lesson-chapter-input" enterkeyhint="done" autocomplete="off" value="${escapeHtml(lesson.chapter)}" />
          </label>
          <label>
            Page
            <input id="lesson-page-input" enterkeyhint="done" autocomplete="off" value="${escapeHtml(lesson.page)}" />
          </label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-play">저장</button>
          <button type="button" class="btn btn-ghost" id="cancel-lesson-meta">취소</button>
        </div>
      </form>
      <p class="muted">${formatDate(lesson.studiedAt)} ${lesson.completed ? "· ✓ 완료" : ""}</p>
    </section>

    <div class="pager">
      <button class="btn btn-ghost" ${prev ? `data-go="#/lesson/${encodeURIComponent(prev.id)}"` : "disabled"}>← 이전 페이지</button>
      <button class="btn btn-ghost" ${next ? `data-go="#/lesson/${encodeURIComponent(next.id)}"` : "disabled"}>다음 페이지 →</button>
    </div>

    <div class="row-actions">
      <label class="check-label">
        <input type="checkbox" id="complete-toggle" ${lesson.completed ? "checked" : ""} />
        학습 완료
      </label>
      <button type="button" class="btn btn-ghost danger" data-delete-lesson="${escapeHtml(lesson.id)}">이 페이지 삭제</button>
    </div>

    <div class="stack photo-actions">
    ${
      ui.objectUrls.length
        ? ui.objectUrls
            .map(
              (_url, index) =>
                `<button class="btn btn-ghost btn-wide" data-open-photo="${index}">원본 페이지${ui.objectUrls.length > 1 ? ` ${index + 1}` : ""} 보기</button>`
            )
            .join("")
        : ""
    }
    <button class="btn btn-play btn-wide" data-go="#/lesson/${encodeURIComponent(lesson.id)}/compare">원본과 한국어 해석 같이 보기</button>
    </div>

    <div class="lesson-study">
      <div class="lesson-study-main">
        <div class="lesson-place">
          <div class="lesson-place-book">${escapeHtml(lesson.bookTitle)}</div>
          <div class="lesson-place-meta">${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)}</div>
        </div>
        <section class="listen-section">
          <div class="section-head">
            <h2>Listening Script</h2>
            <div class="section-actions">
              <button type="button" class="text-btn" data-copy-script>전체 복사</button>
              <button type="button" class="text-btn" id="toggle-script">${ui.hideScript ? "스크립트 보기" : "스크립트 숨기기"}</button>
            </div>
          </div>
          <div id="script-box">
            ${parts.map((part) => partBlock(part, jump)).join("")}
          </div>
          <button type="button" class="btn btn-play btn-wide" data-copy-script>전체 Script 복사</button>
          <p class="hidden-note ${ui.hideScript ? "" : "is-off"}">스크립트가 숨겨져 있습니다. 오디오는 계속 들을 수 있습니다.</p>
        </section>

        <section class="listen-section translation-section">
          <div class="section-head">
            <h2>한글 직역</h2>
            <button class="text-btn" id="toggle-translation">${ui.hideTranslation ? "직역 보기" : "직역 숨기기"}</button>
          </div>
          <p class="hint">재구성 Listening Script를 문장 순서대로 따라간 한국어입니다. 원본 책 문장의 OCR 번역이 아닙니다.</p>
          <div id="translation-box" class="${ui.hideTranslation ? "is-hidden-content" : ""}">
            ${translationBody(lesson)}
          </div>
        </section>

        <section class="listen-section">
          <div class="section-head">
            <h2>Important Expressions</h2>
            <button type="button" class="add-expression-btn open-add-expression">+ 추가하기</button>
          </div>
          <p class="hint">뜻과 활용을 기억해야 하는 어휘·숙어. 여러 개를 한 번에 붙여 넣으면 자동으로 나뉩니다. 예문에서 문장을 지정하면 화면 아래쪽에 형광펜 버튼이 나타납니다.</p>
          <form class="title-editor meta-editor" id="add-expression-form">
            <label>
              표현 붙여넣기
              <textarea id="add-expression-text" class="add-expression-text" rows="10" placeholder="여러 표현을 한 칸에 붙여 넣으세요. 영어와 한국어를 같이 적어도 됩니다.&#10;&#10;• Lost track of time.&#10;  뜻: 시간 가는 줄 모르다&#10;  예문: We lost track of time.&#10;&#10;• come out of one's shell | (사람이) 마음을 열다"></textarea>
            </label>
            <p class="hint">저장하면 표현마다 나눠집니다. • 또는 빈 줄, 뜻/예문 표시가 있으면 더 정확합니다.</p>
            <div class="form-actions">
              <button type="submit" class="btn btn-play">저장</button>
              <button type="button" class="btn btn-ghost" id="cancel-add-expression">취소</button>
            </div>
          </form>
          <div class="stack" id="expression-list">
            ${(lesson.expressions || []).length
              ? lesson.expressions.map((item) => expressionCard(item, jump)).join("")
              : `<div class="empty">저장된 표현이 없습니다.</div>`}
          </div>
          <button type="button" class="add-expression-btn add-expression-btn-end open-add-expression">+ 추가하기</button>
        </section>

        ${
          lesson.memo
            ? `<section class="listen-section">
                <h2>메모</h2>
                <div class="card prose">${nl2br(lesson.memo)}</div>
              </section>`
            : ""
        }
      </div>
      ${audioPanelMarkup(lesson)}
    </div>
  `;

  bindLessonEvents(el, lesson);
  bindAudioPanel(el, lesson).catch((error) => console.error(error));
  if (jump) {
    window.requestAnimationFrame(() => {
      const mark = jump.itemId
        ? el.querySelector(".item-card.is-review-focus")
        : el.querySelector(".search-hit .review-mark") ||
          el.querySelector(".review-mark") ||
          el.querySelector(".item-card.is-review-focus");
      mark?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  const studiedAt = new Date().toISOString();
  lesson.lastStudiedAt = studiedAt;
  getLesson(lesson.id)
    .then((stored) => {
      if (!stored) return saveLesson(lesson, { silent: true });
      stored.lastStudiedAt = studiedAt;
      return saveLesson(stored, { silent: true });
    })
    .catch((error) => console.warn(error));
}

function translationBody(lesson) {
  if (ui.editingTranslation) {
    return `
      <textarea id="translation-editor" class="translation-editor">${escapeHtml(lesson.literalTranslationKo || "")}</textarea>
      <div class="form-actions">
        <button type="button" class="btn btn-play" id="save-translation">저장</button>
        <button type="button" class="btn btn-ghost" id="cancel-translation">취소</button>
      </div>
    `;
  }
  return `
    <div class="card prose" id="translation-text">
      ${
        lesson.literalTranslationKo
          ? nl2br(lesson.literalTranslationKo)
          : `<span class="muted">아직 한글 직역이 없습니다. Listening Script를 기준으로 직접 입력하거나, AI 결과의 [TRANSLATION_KO]를 붙여넣으세요.</span>`
      }
    </div>
    <div class="form-actions translation-actions">
      <button type="button" class="btn btn-ghost" id="edit-translation">수정</button>
      <button type="button" class="btn btn-ghost" id="make-translation">한글 직역 만들기</button>
    </div>
    <p class="hint" id="translation-hint" hidden></p>
  `;
}

function partBlock(part, jump) {
  const label = scriptPartKindLabel(part);
  const heading = part.title
    ? `${label}<span class="part-title">${escapeHtml(part.title)}</span>`
    : label;
  const phrase = jump?.phrase || jump?.word || "";
  const highlighted = phrase
    ? jump?.sentence
      ? highlightSearchInText(part.text, phrase, jump.sentence)
      : markedText(part.text, phrase, Boolean(jump?.word))
    : nl2br(part.text);
  return `
    <article class="card part-card">
      <div class="part-label">${heading}</div>
      <div class="script-en ${ui.hideScript ? "is-hidden-content" : ""}">${highlighted}</div>
    </article>
  `;
}

function expressionCard(item, jump) {
  const focus = jump?.tab !== "points" && jump?.itemId === item.id;
  const needle = focus ? jump?.word || item.phrase : "";
  return `
    <article class="card item-card ${focus ? "is-review-focus" : ""}" data-expression="${item.id}">
      <div class="item-en">${needle ? markedText(item.phrase, needle) : nl2br(item.phrase)}</div>
      <div class="item-ko">${item.meaning ? nl2br(item.meaning) : ""}</div>
      ${exampleMarkup(item)}
      <div class="item-actions">
        <button type="button" class="text-btn danger" data-remove-expression="${item.id}">지우기</button>
        <button class="icon-star ${item.favorite ? "is-on" : ""}" data-fav="${item.id}">${item.favorite ? "★" : "☆"}</button>
      </div>
      <div class="item-extra-actions">
        <button type="button" class="text-btn" data-find-example="${item.id}">예문찾기</button>
        <button type="button" class="text-btn" data-edit-example="${item.id}">예문 등록</button>
      </div>
    </article>
  `;
}

function exampleMarkup(item) {
  if (!item?.example && !item?.exampleKo) return "";
  return `
    ${item.example ? `<div class="item-example" data-pen-field="example" data-pen-item="${item.id}">${renderPenText(item.example, item.exampleHighlights)}</div>` : ""}
    ${item.exampleKo ? `<div class="item-example-ko" data-pen-field="exampleKo" data-pen-item="${item.id}">${renderPenText(item.exampleKo, item.exampleKoHighlights)}</div>` : ""}
  `;
}

function pointCard(item, jump) {
  const focus = jump?.tab === "points" && jump?.itemId === item.id;
  return `
    <article class="card item-card ${focus ? "is-review-focus" : ""}">
      <div class="item-en">${focus ? markedText(item.phrase, item.phrase) : escapeHtml(item.phrase)}</div>
      <div class="item-ko"><span class="label">설명</span> ${escapeHtml(item.note || "")}</div>
      <div class="item-actions">
        <button class="icon-star ${item.difficult ? "is-on" : ""}" data-hard="${item.id}">${item.difficult ? "★" : "☆"}</button>
      </div>
    </article>
  `;
}

function highlightSearchInText(text, word, sentence) {
  const raw = String(text || "");
  const sent = String(sentence || "").trim();
  if (!sent) return markedText(raw, word, true);
  const start = raw.indexOf(sent);
  if (start < 0) return markedText(raw, word, true);
  const before = escapeHtml(raw.slice(0, start));
  const mid = markEscapedText(escapeHtml(raw.slice(start, start + sent.length)), word, true);
  const after = escapeHtml(raw.slice(start + sent.length));
  return `${before}<span class="search-hit">${mid}</span>${after}`.replace(/\n/g, "<br>");
}

function bindLessonEvents(el, lesson) {
  el.querySelectorAll("[data-copy-script]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!lesson.script?.trim()) {
        toast("복사할 Script가 없습니다.");
        return;
      }
      try {
        await copyText(scriptForCopy(lesson.script));
        toast("전체 Script를 복사했습니다.");
      } catch {
        toast("복사에 실패했습니다. 텍스트를 직접 선택해 주세요.");
      }
    });
  });

  el.querySelector("#toggle-script")?.addEventListener("click", (event) => {
    ui.hideScript = !ui.hideScript;
    el.querySelectorAll(".script-en").forEach((node) => {
      node.classList.toggle("is-hidden-content", ui.hideScript);
    });
    event.currentTarget.textContent = ui.hideScript ? "스크립트 보기" : "스크립트 숨기기";
    el.querySelector(".hidden-note")?.classList.toggle("is-off", !ui.hideScript);
  });

  el.querySelector("#toggle-translation")?.addEventListener("click", (event) => {
    ui.hideTranslation = !ui.hideTranslation;
    el.querySelector("#translation-box")?.classList.toggle("is-hidden-content", ui.hideTranslation);
    event.currentTarget.textContent = ui.hideTranslation ? "직역 보기" : "직역 숨기기";
  });

  bindTranslationEditor(el, lesson);

  el.querySelectorAll("[data-open-photo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const start = Number(btn.getAttribute("data-open-photo")) || 0;
      openLightbox(ui.objectUrls, start);
    });
  });

  el.querySelector("#complete-toggle")?.addEventListener("change", async (event) => {
    lesson.completed = event.target.checked;
    lesson.updatedAt = new Date().toISOString();
    await saveLesson(lesson);
    toast(lesson.completed ? "학습 완료로 표시했습니다." : "완료 표시를 해제했습니다.");
  });

  el.querySelector("#open-book-pick")?.addEventListener("click", async () => {
    const picked = await openBookPicker({ titles: bookTitles, current: lesson.bookTitle });
    if (!picked || picked === lesson.bookTitle) return;
    try {
      await updateLessonMeta(lesson.id, { bookTitle: picked });
      toast("이 페이지의 책 제목을 바꿨습니다.");
      await renderLesson(el, lesson.id);
    } catch (error) {
      console.error(error);
      toast("제목을 바꾸지 못했습니다. 다시 시도해 주세요.");
    }
  });
  const metaForm = el.querySelector("#lesson-meta-form");
  el.querySelector("#edit-lesson-meta")?.addEventListener("click", () => {
    metaForm?.classList.add("is-open");
    el.querySelector("#lesson-book-input")?.focus();
    metaForm?.scrollIntoView({ block: "nearest" });
  });
  el.querySelector("#cancel-lesson-meta")?.addEventListener("click", () => {
    metaForm?.classList.remove("is-open");
  });
  metaForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const bookTitle = String(el.querySelector("#lesson-book-input")?.value || "").trim();
    const chapter = String(el.querySelector("#lesson-chapter-input")?.value || "").trim();
    const page = String(el.querySelector("#lesson-page-input")?.value || "").trim();
    if (!bookTitle || !chapter || !page) {
      toast("책 제목, Chapter, Page를 입력해 주세요.");
      return;
    }
    try {
      await updateLessonMeta(lesson.id, { bookTitle, chapter, page });
      toast("이 페이지의 책 · 챕터 · 페이지를 수정했습니다.");
      await renderLesson(el, lesson.id);
    } catch (error) {
      console.error(error);
      toast("수정하지 못했습니다. 다시 시도해 주세요.");
    }
  });

  el.querySelectorAll("[data-fav]").forEach((btn) => bindFavButton(btn, lesson));
  el.querySelectorAll("[data-remove-expression]").forEach((btn) => bindRemoveExpression(btn, lesson, el));
  el.querySelectorAll("[data-find-example]").forEach((btn) => bindFindExample(btn, lesson));
  el.querySelectorAll("[data-edit-example]").forEach((btn) => bindEditExample(btn, lesson, el));

  bindAddExpression(el, lesson);
  bindExamplePen({
    root: el,
    resolve: (host) => {
      const item = lesson.expressions.find((row) => row.id === host.getAttribute("data-pen-item"));
      if (!item) return null;
      return { item, lesson, save: () => saveLesson(lesson) };
    },
  });
}

function bindFindExample(btn, lesson) {
  btn?.addEventListener("click", async () => {
    const item = lesson.expressions.find((row) => row.id === btn.getAttribute("data-find-example"));
    if (!item) return;
    const lessons = await getAllLessons();
    openExampleFinder({
      phrase: item.phrase,
      meaning: item.meaning,
      lessons,
    });
  });
}

function bindEditExample(btn, lesson, el) {
  btn?.addEventListener("click", async () => {
    const id = btn.getAttribute("data-edit-example") || "";
    const item = lesson.expressions.find((row) => row.id === id);
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
      const card = el.querySelector(`[data-expression="${id}"]`);
      refreshExampleOnCard(card, item);
      toast("예문을 등록했습니다.");
    } catch (error) {
      console.error(error);
      item.example = prevExample;
      item.exampleKo = prevKo;
      item.exampleHighlights = prevMarks;
      item.exampleKoHighlights = prevKoMarks;
      toast("저장하지 못했습니다. 다시 시도해 주세요.");
    }
  });
}

function refreshExampleOnCard(card, item) {
  if (!card) return;
  card.querySelectorAll(".item-example, .item-example-ko").forEach((node) => node.remove());
  const actions = card.querySelector(".item-actions");
  if (!actions) return;
  actions.insertAdjacentHTML("beforebegin", exampleMarkup(item));
}

function bindRemoveExpression(btn, lesson, el) {
  btn?.addEventListener("click", async () => {
    const id = btn.getAttribute("data-remove-expression") || "";
    const item = lesson.expressions.find((row) => row.id === id);
    if (!item) return;
    const ok = await askConfirm("이미 아는 표현은 목록에서 지울 수 있습니다. 이 표현을 중요 표현에서 삭제할까요?");
    if (!ok) return;
    const prev = lesson.expressions;
    lesson.expressions = prev.filter((row) => row.id !== id);
    lesson.updatedAt = new Date().toISOString();
    try {
      await saveLesson(lesson);
      btn.closest(".item-card")?.remove();
      const list = el.querySelector("#expression-list");
      if (list && !list.querySelector(".item-card")) {
        list.innerHTML = `<div class="empty">저장된 표현이 없습니다.</div>`;
      }
      toast("중요 표현에서 지웠습니다.");
    } catch (error) {
      console.error(error);
      lesson.expressions = prev;
      toast("삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  });
}

function bindFavButton(btn, lesson) {
  btn?.addEventListener("click", async () => {
    const item = lesson.expressions.find((row) => row.id === btn.dataset.fav);
    if (!item) return;
    item.favorite = !item.favorite;
    await saveLesson(lesson);
    btn.classList.toggle("is-on", item.favorite);
    btn.textContent = item.favorite ? "★" : "☆";
  });
}

function bindAddExpression(el, lesson) {
  const form = el.querySelector("#add-expression-form");
  const input = el.querySelector("#add-expression-text");
  el.querySelectorAll(".open-add-expression").forEach((btn) => {
    btn.addEventListener("click", () => {
      form?.classList.add("is-open");
      input?.focus();
      form?.scrollIntoView({ block: "nearest" });
    });
  });
  el.querySelector("#cancel-add-expression")?.addEventListener("click", () => {
    form?.classList.remove("is-open");
    if (input) input.value = "";
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = String(input?.value || "").trim();
    if (!raw) {
      toast("표현을 입력해 주세요.");
      input?.focus();
      return;
    }
    const parsed = parseExpressions(raw);
    const blocks = parsed.length ? parsed : [{ phrase: raw, meaning: "", example: "" }];
    const now = new Date().toISOString();
    const seen = new Set((lesson.expressions || []).map((row) => String(row.phrase || "").trim().toLowerCase()));
    const added = [];
    for (const row of blocks) {
      const phrase = String(row.phrase || "").trim();
      if (!phrase) continue;
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      added.push({
        id: uid(),
        phrase,
        meaning: String(row.meaning || "").trim(),
        example: String(row.example || "").trim(),
        exampleKo: String(row.exampleKo || "").trim(),
        createdAt: now,
        updatedAt: now,
        favorite: false,
        difficult: false,
        manual: true,
      });
    }
    if (!added.length) {
      toast("새로 넣을 표현이 없습니다. 이미 같은 표현이 있을 수 있습니다.");
      return;
    }
    lesson.expressions = [...added, ...(lesson.expressions || [])];
    lesson.updatedAt = now;
    try {
      await saveLesson(lesson);
      toast(added.length === 1 ? "중요 표현을 추가했습니다." : `중요 표현 ${added.length}개를 추가했습니다.`);
      form.classList.remove("is-open");
      if (input) input.value = "";
      const list = el.querySelector("#expression-list");
      list?.querySelector(".empty")?.remove();
      list?.insertAdjacentHTML("afterbegin", added.map((item) => expressionCard(item, null)).join(""));
      for (const item of added) {
        bindFavButton(list?.querySelector(`[data-fav="${item.id}"]`), lesson);
        bindRemoveExpression(list?.querySelector(`[data-remove-expression="${item.id}"]`), lesson, el);
        bindFindExample(list?.querySelector(`[data-find-example="${item.id}"]`), lesson);
        bindEditExample(list?.querySelector(`[data-edit-example="${item.id}"]`), lesson, el);
      }
    } catch (error) {
      console.error(error);
      const ids = new Set(added.map((item) => item.id));
      lesson.expressions = lesson.expressions.filter((row) => !ids.has(row.id));
      toast("저장하지 못했습니다. 다시 시도해 주세요.");
    }
  });
}

function bindTranslationEditor(el, lesson) {
  const box = el.querySelector("#translation-box");
  if (!box) return;

  el.querySelector("#edit-translation")?.addEventListener("click", () => {
    ui.editingTranslation = true;
    box.classList.remove("is-hidden-content");
    ui.hideTranslation = false;
    el.querySelector("#toggle-translation").textContent = "직역 숨기기";
    box.innerHTML = translationBody(lesson);
    bindTranslationEditor(el, lesson);
    box.querySelector("#translation-editor")?.focus();
  });

  el.querySelector("#cancel-translation")?.addEventListener("click", () => {
    ui.editingTranslation = false;
    box.innerHTML = translationBody(lesson);
    bindTranslationEditor(el, lesson);
  });

  el.querySelector("#save-translation")?.addEventListener("click", async () => {
    const value = box.querySelector("#translation-editor")?.value || "";
    lesson.literalTranslationKo = value.trim();
    lesson.updatedAt = new Date().toISOString();
    await saveLesson(lesson);
    ui.editingTranslation = false;
    box.innerHTML = translationBody(lesson);
    bindTranslationEditor(el, lesson);
    toast("한글 직역을 저장했습니다.");
  });

  el.querySelector("#make-translation")?.addEventListener("click", async () => {
    const result = await generateKoreanTranslation(lesson.script);
    const hint = el.querySelector("#translation-hint");
    if (hint) {
      hint.hidden = false;
      hint.textContent = result.message;
    } else {
      toast(result.message);
    }
    ui.editingTranslation = true;
    box.classList.remove("is-hidden-content");
    ui.hideTranslation = false;
    el.querySelector("#toggle-translation").textContent = "직역 숨기기";
    box.innerHTML = translationBody(lesson);
    bindTranslationEditor(el, lesson);
    if (hint && result.message) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = result.message;
      box.prepend(note);
    }
    box.querySelector("#translation-editor")?.focus();
  });
}

