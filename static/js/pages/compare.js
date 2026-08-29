import { getLesson, saveLesson, getLessonImageIds } from "../storage/lessons.js?v=20260825c";
import { getImage } from "../storage/images.js?v=20260825c";
import { parseScriptParts, parseLiteralTranslation, scriptPartKindLabel, scriptForCopy, serializePairList, normalizeExpressions } from "../services/parser.js?v=20260829b";
import { copyText, escapeHtml, nl2br, toast } from "../utils.js?v=20260816q";
import { renderPenText } from "../ui/penHighlight.js?v=20260823n";

let photoUrls = [];

export async function renderCompare(el, id) {
  const lesson = await getLesson(id);
  if (!lesson) {
    el.innerHTML = `<div class="empty">학습자료를 찾지 못했습니다.</div>`;
    return;
  }

  for (const url of photoUrls) URL.revokeObjectURL(url);
  photoUrls = [];
  for (const imageId of getLessonImageIds(lesson)) {
    const image = await getImage(imageId);
    if (image?.blob) photoUrls.push(URL.createObjectURL(image.blob));
  }

  lesson.expressions = normalizeExpressions(lesson.expressions || []);

  const text = lesson.literalTranslationKo || "";
  const koHtml = koreanBody(text);
  const koStructured = /compare-part/.test(koHtml);
  el.innerHTML = `
    <div class="compare-view">
      <section class="compare-photo" aria-label="원본 페이지">
        <div class="compare-place">
          <div class="lesson-place-book">${escapeHtml(lesson.bookTitle)}</div>
          <div class="lesson-place-meta">${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)}</div>
        </div>
        ${
          photoUrls.length
            ? photoUrls
                .map((url, index) => `<img src="${url}" alt="원본 페이지 ${index + 1}">`)
                .join("")
            : `<div class="compare-empty">이 페이지에 원본 사진이 없습니다. 학습자료 수정에서 사진을 추가할 수 있습니다.</div>`
        }
      </section>
      <section class="compare-ko">
        <div class="compare-ko-head">
          <h2 id="compare-title">한글 직역</h2>
        </div>
        <p class="hint" id="compare-hint">메인 화면의 한글 직역과 같은 내용입니다. 여기서 수정하면 메인 화면에도 반영됩니다.</p>
        <div class="compare-ko-body${koStructured ? " is-script" : ""}" id="compare-body">
          ${koHtml}
        </div>
        <div class="compare-actions">
          <div class="compare-actions-main" id="compare-ko-actions">
            <button type="button" class="btn btn-play" id="compare-interpret">해석하기</button>
            <button type="button" class="btn btn-ghost" id="compare-edit-ko" ${text ? "" : "hidden"}>수정</button>
            <button type="button" class="btn btn-ghost" id="compare-edit-script" hidden>수정</button>
            <button type="button" class="btn btn-play" id="compare-save" hidden>저장</button>
            <button type="button" class="btn btn-ghost" id="compare-cancel" hidden>취소</button>
          </div>
          <div class="compare-actions-side">
            <button type="button" class="btn btn-play" id="compare-show-script">영문 스크립트 보기</button>
            <button type="button" class="btn btn-play" id="compare-show-ko" hidden>한글 직역</button>
            <button type="button" class="btn btn-play" id="compare-show-expressions">중요어구</button>
            <button type="button" class="btn btn-play" id="compare-copy">텍스트 복사</button>
          </div>
        </div>
      </section>
    </div>
  `;

  const title = el.querySelector("#compare-title");
  const body = el.querySelector("#compare-body");
  const hint = el.querySelector("#compare-hint");
  const koActions = el.querySelector("#compare-ko-actions");
  const saveBtn = el.querySelector("#compare-save");
  const cancelBtn = el.querySelector("#compare-cancel");
  const editKoBtn = el.querySelector("#compare-edit-ko");
  const editScriptBtn = el.querySelector("#compare-edit-script");
  const interpretBtn = el.querySelector("#compare-interpret");
  const showScriptBtn = el.querySelector("#compare-show-script");
  const showKoBtn = el.querySelector("#compare-show-ko");
  const showExpressionsBtn = el.querySelector("#compare-show-expressions");
  let mode = "ko";
  let editing = "";

  const resetBodyClass = () => {
    body.classList.remove("is-script", "is-expressions");
  };

  const setSideButtons = ({ script, ko, expressions }) => {
    showScriptBtn.hidden = !script;
    showKoBtn.hidden = !ko;
    showExpressionsBtn.hidden = !expressions;
  };

  const setMainButtons = (view) => {
    interpretBtn.hidden = view !== "ko";
    editKoBtn.hidden = view !== "ko" || !lesson.literalTranslationKo;
    editScriptBtn.hidden = view !== "script";
    saveBtn.hidden = view !== "edit";
    cancelBtn.hidden = view !== "edit";
    koActions.hidden = view === "expressions";
  };

  const showEditor = (target, focus) => {
    editing = target;
    mode = target;
    resetBodyClass();
    const isScript = target === "script";
    title.textContent = isScript ? "Listening Script" : "한글 직역";
    hint.hidden = false;
    hint.textContent = isScript
      ? "메인 화면의 Listening Script와 같은 내용입니다. 원본 사진과 대조해 고친 뒤 저장하면 메인 화면에도 반영됩니다."
      : "메인 화면의 한글 직역과 같은 내용입니다. 여기서 수정하면 메인 화면에도 반영됩니다.";
    const value = isScript ? lesson.script || "" : lesson.literalTranslationKo || "";
    const placeholder = isScript
      ? "Listening Script를 여기에 입력하세요."
      : "메인 화면과 같은 한글 직역을 여기에 입력하세요.";
    body.innerHTML = `<textarea id="compare-editor" class="compare-editor" placeholder="${placeholder}">${escapeHtml(value)}</textarea>`;
    setMainButtons("edit");
    setSideButtons({ script: false, ko: false, expressions: false });
    if (focus) {
      window.setTimeout(() => body.querySelector("#compare-editor")?.focus(), 50);
    }
  };

  const showKorean = () => {
    editing = "";
    mode = "ko";
    const value = lesson.literalTranslationKo || "";
    title.textContent = "한글 직역";
    hint.hidden = false;
    hint.textContent =
      "메인 화면의 한글 직역과 같은 내용입니다. 여기서 수정하면 메인 화면에도 반영됩니다.";
    resetBodyClass();
    body.innerHTML = koreanBody(value);
    if (body.querySelector(".compare-part")) body.classList.add("is-script");
    setMainButtons("ko");
    setSideButtons({ script: true, ko: false, expressions: true });
  };

  const showScript = () => {
    editing = "";
    mode = "script";
    title.textContent = "Listening Script";
    hint.hidden = false;
    hint.textContent =
      "메인 화면의 Listening Script와 같은 내용입니다. 원본 사진과 대조해 고치려면 수정을 누르세요. 저장하면 메인 화면에도 반영됩니다.";
    resetBodyClass();
    body.classList.add("is-script");
    body.innerHTML = scriptBody(lesson.script);
    setMainButtons("script");
    setSideButtons({ script: false, ko: true, expressions: true });
  };

  const showExpressions = () => {
    editing = "";
    mode = "expressions";
    title.textContent = "Important Expression";
    hint.hidden = true;
    resetBodyClass();
    body.classList.add("is-expressions");
    body.innerHTML = expressionsBody(lesson.expressions);
    setMainButtons("expressions");
    setSideButtons({ script: true, ko: true, expressions: false });
  };

  interpretBtn.addEventListener("click", () => {
    toast("메인 화면의 한글 직역을 여기서 수정할 수 있습니다.");
    showEditor("ko", true);
  });
  editKoBtn.addEventListener("click", () => showEditor("ko", true));
  editScriptBtn.addEventListener("click", () => showEditor("script", true));
  cancelBtn.addEventListener("click", () => {
    if (editing === "script") showScript();
    else showKorean();
  });
  showScriptBtn.addEventListener("click", () => showScript());
  showKoBtn.addEventListener("click", () => showKorean());
  showExpressionsBtn.addEventListener("click", () => showExpressions());

  el.querySelector("#compare-copy").addEventListener("click", async () => {
    const editor = body.querySelector("#compare-editor");
    const copyMode = editor ? editing || mode : mode;
    const value = editor
      ? String(editor.value || "").trim()
      : copyMode === "script"
        ? scriptForCopy(lesson.script)
        : copyMode === "expressions"
          ? serializePairList(lesson.expressions)
          : String(lesson.literalTranslationKo || "").trim();
    if (!value) {
      toast(
        copyMode === "script"
          ? "복사할 영문 스크립트가 없습니다."
          : copyMode === "expressions"
            ? "복사할 중요 어구가 없습니다."
            : "복사할 한글 직역이 없습니다."
      );
      return;
    }
    try {
      await copyText(value);
      toast(
        copyMode === "script"
          ? "영문 스크립트를 복사했습니다."
          : copyMode === "expressions"
            ? "중요 어구를 복사했습니다."
            : "한글 직역을 복사했습니다."
      );
    } catch {
      toast("복사에 실패했습니다. 텍스트를 직접 선택해 주세요.");
    }
  });

  saveBtn.addEventListener("click", async () => {
    const value = body.querySelector("#compare-editor")?.value || "";
    const savingScript = editing === "script";
    if (savingScript) lesson.script = value.trim();
    else lesson.literalTranslationKo = value.trim();
    lesson.updatedAt = new Date().toISOString();
    try {
      await saveLesson(lesson);
      toast(savingScript ? "Listening Script를 저장했습니다." : "한글 직역을 저장했습니다.");
      if (savingScript) showScript();
      else showKorean();
    } catch (error) {
      console.error(error);
    }
  });
}

function koreanBody(text) {
  const structured = translationScenesBody(text);
  if (structured) return structured;
  return text
    ? `<div class="compare-text">${nl2br(text)}</div>`
    : `<div class="muted">아직 한글 직역이 없습니다. 메인 화면이나 학습자료 수정에서 넣으면 여기에 그대로 나타납니다.</div>`;
}

function translationScenesBody(text) {
  const scenes = parseLiteralTranslation(text).filter(
    (scene) => scene.lines?.length || String(scene.prose || "").trim()
  );
  const hasNotes = scenes.some((scene) => scene.lines?.some((line) => line.literal || line.idiomatic));
  if (!hasNotes) return "";
  return scenes
    .map((scene) => {
      const lines = (scene.lines || [])
        .map((line) => {
          const speaker = line.speaker
            ? `<span class="compare-speaker">${escapeHtml(line.speaker)}:</span> `
            : "";
          const en = line.en ? `<div class="compare-line-en">${speaker}${formatCompareInline(line.en)}</div>` : "";
          const ko = line.literal ? `<div class="compare-line-ko">${formatCompareInline(line.literal)}</div>` : "";
          const note = line.idiomatic
            ? `<div class="compare-line-note">${formatCompareInline(line.idiomatic)}</div>`
            : "";
          return `<div class="compare-line">${en}${ko}${note}</div>`;
        })
        .join("");
      const prose = scene.prose ? `<div class="compare-text">${nl2br(scene.prose)}</div>` : "";
      return `
        <article class="card part-card compare-part">
          <div class="part-label">${partHeading(scene)}</div>
          ${lines}${prose}
        </article>
      `;
    })
    .join("");
}

function formatCompareInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function partHeading(part) {
  const label = scriptPartKindLabel(part);
  return part.title ? `${label}<span class="part-title">${escapeHtml(part.title)}</span>` : label;
}

function scriptBody(script) {
  const parts = parseScriptParts(script);
  if (!parts.length) {
    return `<div class="muted">Listening Script가 없습니다. 수정에서 입력할 수 있습니다.</div>`;
  }
  return parts
    .map(
      (part) => `
        <article class="card part-card compare-part">
          <div class="part-label">${partHeading(part)}</div>
          <div class="script-en">${nl2br(part.text)}</div>
        </article>
      `
    )
    .join("");
}

function expressionsBody(items) {
  const list = normalizeExpressions(items);
  if (!list.length) {
    return `<div class="muted">저장된 중요 어구가 없습니다. AI 스크립트 읽기에서 자동 분석하면 여기에 표시됩니다.</div>`;
  }
  return list
    .map(
      (item) => `
        <article class="card item-card compare-expression">
          <div class="item-en">${escapeHtml(item.phrase)}</div>
          <div class="item-ko">${escapeHtml(item.meaning || "")}</div>
          ${item.example ? `<div class="item-example">${renderPenText(item.example, item.exampleHighlights)}</div>` : ""}
          ${item.exampleKo ? `<div class="item-example-ko">${renderPenText(item.exampleKo, item.exampleKoHighlights)}</div>` : ""}
        </article>
      `
    )
    .join("");
}
