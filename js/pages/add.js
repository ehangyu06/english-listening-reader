import { getAllLessons, getLesson, saveLesson, getLessonImageIds, MAX_PAGE_PHOTOS } from "../storage/lessons.js?v=20260825c";
import { listBookTitles } from "../storage/books.js?v=20260816w";
import { getSetting, setSetting } from "../storage/db.js?v=20260825c";
import { saveImage, getImage, deleteImage, compressImageFile } from "../storage/images.js?v=20260825c";
import { parseAiResponse, serializePairList, describeParseResult, AI_PROMPT_TEMPLATE, normalizeExpressions } from "../services/parser.js?v=20260825b";
import { createLesson } from "../models.js?v=20260825b";
import { escapeHtml, todayInputValue, toast, uid, go } from "../utils.js?v=20260816p";

const NATURAL_AI_OUTPUT = `Listening Script

Part 1: A Proudly Ordinary Family

Mr. and Mrs. Dursley lived at number four, Privet Drive. They took great pride in considering themselves completely ordinary people, thank you very much. In fact, you would never expect them to get tangled up in anything bizarre or magical, because they had no patience for that kind of foolishness.

Part 2: The Dursley Household

Mr. Dursley ran a drill manufacturing company called Grunnings. He was a hefty, broad-shouldered man who seemed to have almost no neck at all, though he sported an enormous mustache.

한글 직역

1부
더즐리 부부는 프리벳 드라이브 4번지에 살았다. 그들은 자신들을 완전히 평범한 사람들이라고 여기는 것을 매우 자랑스러워했다. 사실 그들이 이상하거나 마법적인 일에 휘말릴 것이라고는 전혀 기대할 수 없었는데, 그런 어리석은 일에는 조금도 인내심이 없었기 때문이다.

2부
더즐리 씨는 그루닝스라는 드릴 제조 회사를 운영했다. 그는 목이 거의 없어 보일 정도로 덩치가 크고 어깨가 넓은 남자였지만, 아주 커다란 콧수염을 기르고 있었다.

Important Expression

thank you very much | 정말이지, 아주
get tangled up in | ~에 휘말리다
had no patience for | ~을 전혀 참지 못하다
almost no neck at all | 목이 거의 없다시피 하다`;

const SAMPLE_AI_OUTPUT = `[SUMMARY_KO]
작은 도서관에서 비가 오는 오후, 미나는 창가 자리에 앉아 조용히 책을 읽는다. 시계가 네 시를 치자 그녀는 우산을 집어 들고, 젖은 거리를 따라 집으로 향한다.

[SCRIPT]
Part 1: A Quiet Afternoon

Mina sat by the window and turned the pages slowly. Rain tapped on the glass, and the library smelled of paper and warm light. She was in no hurry to leave.

Part 2: Walking Home

When the clock struck four, she picked up her umbrella and stepped into the street. The puddles caught the shop lights. Mina kept her head down, but she could not help smiling at the sound of the rain.

[TRANSLATION_KO]
Part 1
미나는 창가에 앉아 천천히 책장을 넘겼다. 비가 유리를 두드렸고, 도서관은 종이와 따뜻한 빛 냄새가 났다. 그녀는 떠날 마음이 전혀 없었다.

Part 2
시계가 네 시를 치자 그녀는 우산을 집어 들고 거리로 나섰다. 물웅덩이가 가게 불빛을 담았다. 미나는 고개를 숙였지만, 빗소리에 미소 짓지 않을 수 없었다.

[EXPRESSIONS]
in no hurry | 서두르지 않다
pick up | ~을 집어 들다
could not help -ing | ~하지 않을 수 없다

[LISTENING_POINTS]
tapped on the glass | tapped on이 붙어 들릴 수 있음
in no hurry | no가 약하게 들릴 수 있음
could not help smiling | could not이 couldn't처럼 빠르게 이어질 수 있음

[MEMO]
원문을 복제하지 않고 새로 쓴 학습용 예시입니다.`;

function bookSelectHtml(books, currentBook = "") {
  const known = books.includes(currentBook) ? currentBook : "";
  const startNew = !books.length || Boolean(currentBook && !known);
  return `
    <select id="book-select">
      ${!known && !startNew ? `<option value="" selected disabled>책을 선택하세요</option>` : ""}
      ${books
        .map(
          (title) =>
            `<option value="${escapeHtml(title)}" ${title === known ? "selected" : ""}>${escapeHtml(title)}</option>`
        )
        .join("")}
      <option value="__new__" ${startNew ? "selected" : ""}>＋ 새 책 제목 입력</option>
    </select>
    <input id="book-new" enterkeyhint="done" autocomplete="off" placeholder="예: Harry Potter" value="${startNew ? escapeHtml(currentBook) : ""}" ${startNew ? "" : "hidden"} />
    <input type="hidden" name="bookTitle" id="book-value" value="${escapeHtml(startNew ? currentBook : known)}" />
    <span class="hint">목록에서 고르거나, 이 페이지의 새 제목을 입력하세요. 이 페이지만 바뀝니다.</span>
  `;
}

function syncBookField(root) {
  const select = root.querySelector("#book-select");
  const extra = root.querySelector("#book-new");
  const hidden = root.querySelector("#book-value");
  if (!hidden) return;
  if (!select) {
    hidden.value = String(extra?.value || hidden.value || "").trim();
    return;
  }
  const isNew = select.value === "__new__";
  if (extra) extra.hidden = !isNew;
  hidden.value = isNew ? String(extra?.value || "").trim() : select.value;
}

function chapterInputHtml(currentChapter = "") {
  return `
    <input name="chapter" id="chapter-value" enterkeyhint="done" autocomplete="off" placeholder="예: Isaiah 29" value="${escapeHtml(currentChapter)}" />
    <span class="hint">챕터 이름을 직접 입력하세요.</span>
  `;
}

export async function renderAdd(el, editId) {
  const existing = editId ? await getLesson(editId) : null;
  const lessons = await getAllLessons();
  const books = (await listBookTitles(lessons.map((lesson) => lesson.bookTitle))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  const currentBook = existing?.bookTitle || (await getSetting("currentBook", "")) || "";

  let photos = [];

  el.innerHTML = `
    <form class="form" id="lesson-form">
      <label id="book-field">
        책 제목
        ${bookSelectHtml(books, currentBook)}
      </label>
      <div class="form-row">
        <label id="chapter-field">
          Chapter
          ${chapterInputHtml(existing?.chapter || "")}
        </label>
        <label>
          Page
          <input name="page" required placeholder="1" value="${escapeHtml(existing?.page || "")}" />
        </label>
      </div>
      <label>
        학습 날짜
        <input name="studiedAt" type="date" value="${escapeHtml(existing?.studiedAt || todayInputValue())}" />
      </label>

      <div class="block">
        <div class="block-title">원본 페이지 사진</div>
        <p class="hint">개인 학습 참고용입니다. 사진은 최대 10장까지 이 기기의 IndexedDB에만 저장됩니다.</p>
        <div class="photo-add-row">
          <input id="photo-input" class="photo-file-input" type="file" accept="image/*" multiple />
          <span class="muted" id="photo-count"></span>
        </div>
        <div id="photo-preview" class="photo-preview"></div>
      </div>

      <div class="block highlight">
        <div class="block-title">AI 스크립트 읽기</div>
        <p class="hint">사진으로 만든 AI 답변을 붙여넣은 뒤 자동 분석하기를 누르세요. Listening Script, 한글 직역, Important Expression이 아래 칸으로 나뉩니다. AI를 쓰지 않고 아래 칸에 직접 입력해도 됩니다. 바로 저장되지 않습니다.</p>
        <div class="form-actions">
          <button type="button" class="text-btn" id="copy-prompt">AI 프롬프트 복사</button>
          <button type="button" class="text-btn" id="fill-example">태그 예시 넣기</button>
          <button type="button" class="text-btn" id="fill-natural">3영역 예시 넣기</button>
        </div>
        <textarea id="raw-ai" class="raw-ai" placeholder="Listening Script, 한글 직역, Important Expression이 포함된 AI 답변을 붙여넣으세요."></textarea>
        <button type="button" class="btn btn-primary" id="parse-btn">자동 분석하기</button>
        <div id="parse-status" class="parse-status" hidden></div>
      </div>

      <textarea name="summaryKo" id="field-summary" hidden>${escapeHtml(existing?.summaryKo || "")}</textarea>
      <textarea name="listeningPointsText" id="field-points" hidden>${escapeHtml(serializePairList(existing?.listeningPoints || [], "note"))}</textarea>

      <label>
        Listening Script
        <span class="hint">재구성한 영문 스크립트입니다. AI 분석 결과를 넣거나, 여기에 직접 입력하세요.</span>
        <textarea name="script" id="field-script" class="en-area" placeholder="영문 Listening Script를 입력하세요.">${escapeHtml(existing?.script || "")}</textarea>
      </label>
      <label>
        한글 직역
        <span class="hint">재구성 Listening Script를 문장 순서대로 번역한 한국어입니다.</span>
        <textarea name="literalTranslationKo" id="field-translation" placeholder="한글 직역을 입력하세요.">${escapeHtml(existing?.literalTranslationKo || "")}</textarea>
      </label>
      <label>
        Important Expression
        <span class="hint">영어 표현, 다음 줄에 한국어 뜻, 그다음 줄에 예문. 한 줄로 쓸 때는 영어 표현 | 한국어 뜻. 표현마다 빈 줄로 나누면 카드로 저장됩니다.</span>
        <textarea name="expressionsText" id="field-expressions" class="en-area">${escapeHtml(serializePairList(normalizeExpressions(existing?.expressions || [])))}</textarea>
      </label>
      <label>
        메모
        <textarea name="memo" id="field-memo">${escapeHtml(existing?.memo || "")}</textarea>
      </label>

      <button type="button" class="btn btn-primary btn-wide" id="save-lesson">${existing ? "수정 저장" : "학습자료 저장"}</button>
    </form>
  `;

  syncBookField(el);
  el.querySelector("#book-select")?.addEventListener("change", () => {
    syncBookField(el);
    if (el.querySelector("#book-select")?.value === "__new__") {
      el.querySelector("#book-new")?.focus();
    }
  });
  el.querySelector("#book-new")?.addEventListener("input", () => syncBookField(el));

  const preview = el.querySelector("#photo-preview");
  const photoInput = el.querySelector("#photo-input");
  const photoCount = el.querySelector("#photo-count");

  const revokePhoto = (photo) => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
  };

  const renderPhotos = () => {
    const full = photos.length >= MAX_PAGE_PHOTOS;
    const slots = photos
      .map(
        (photo, index) => `
      <div class="photo-slot">
        ${photo.url ? `<img src="${photo.url}" alt="원본 페이지 ${index + 1}">` : `<div class="muted">사진 ${index + 1}</div>`}
        <button type="button" class="text-btn danger" data-remove-photo="${index}">사진 삭제</button>
      </div>`
      )
      .join("");
    const addControl = full
      ? `<p class="hint photo-add-limit">사진은 최대 ${MAX_PAGE_PHOTOS}장까지입니다.</p>`
      : `<label class="text-btn photo-add-btn" for="photo-input">사진 추가</label>`;
    preview.innerHTML = `${slots}${addControl}`;
    if (photoInput) photoInput.disabled = full;
    if (photoCount) {
      photoCount.textContent = `${photos.length} / ${MAX_PAGE_PHOTOS}`;
    }
  };

  for (const id of getLessonImageIds(existing)) {
    const image = await getImage(id);
    photos.push({
      id,
      file: null,
      url: image?.blob ? URL.createObjectURL(image.blob) : "",
    });
  }
  renderPhotos();

  el.querySelector("#fill-example").addEventListener("click", () => {
    el.querySelector("#raw-ai").value = SAMPLE_AI_OUTPUT;
    toast("태그 예시를 넣었습니다. 자동 분석하기를 눌러 보세요.");
  });

  el.querySelector("#fill-natural").addEventListener("click", () => {
    el.querySelector("#raw-ai").value = NATURAL_AI_OUTPUT;
    toast("3영역 예시를 넣었습니다. 자동 분석하기를 눌러 보세요.");
  });

  el.querySelector("#copy-prompt").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      toast("AI 프롬프트를 복사했습니다.");
    } catch {
      toast("복사에 실패했습니다. 텍스트를 직접 선택해 주세요.");
    }
  });

  el.querySelector("#photo-input").addEventListener("change", (event) => {
    const files = [...(event.target.files || [])].filter((file) => file.type.startsWith("image/") || !file.type);
    event.target.value = "";
    if (!files.length) return;
    const room = MAX_PAGE_PHOTOS - photos.length;
    if (room <= 0) {
      toast("사진은 최대 10장까지 넣을 수 있습니다.");
      return;
    }
    const chosen = files.slice(0, room);
    if (files.length > room) {
      toast("사진은 최대 10장까지 넣을 수 있습니다.");
    }
    for (const file of chosen) {
      photos.push({
        id: "",
        file,
        url: URL.createObjectURL(file),
      });
    }
    renderPhotos();
  });

  preview.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-photo]");
    if (!btn) return;
    const index = Number(btn.getAttribute("data-remove-photo"));
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return;
    revokePhoto(photos[index]);
    photos.splice(index, 1);
    renderPhotos();
    toast("저장 시 이 사진이 빠집니다.");
  });

  el.querySelector("#parse-btn").addEventListener("click", () => {
    const rawField = el.querySelector("#raw-ai");
    const raw = rawField.value;
    const parsed = parseAiResponse(raw);
    const status = el.querySelector("#parse-status");
    const rows = describeParseResult(parsed).filter((row) => row.label !== "메모" || row.ok);
    const foundAny = Boolean(
      parsed.summaryKo ||
        parsed.script ||
        parsed.literalTranslationKo ||
        parsed.expressions.length ||
        parsed.listeningPoints.length ||
        parsed.memo
    );

    el.querySelector("#field-summary").value = parsed.summaryKo || "";
    el.querySelector("#field-script").value = parsed.script || "";
    el.querySelector("#field-translation").value = parsed.literalTranslationKo || "";
    el.querySelector("#field-expressions").value = serializePairList(parsed.expressions);
    el.querySelector("#field-points").value = serializePairList(parsed.listeningPoints, "note");
    el.querySelector("#field-memo").value = parsed.memo || "";

    status.hidden = false;
    status.innerHTML = `
      <div class="parse-status-title">자동 분석 결과</div>
      ${rows
        .map(
          (row) =>
            `<div class="${row.ok ? "parse-ok" : "parse-miss"}">${row.ok ? "✓" : "○"} ${escapeHtml(row.label)} ${escapeHtml(row.detail)}</div>`
        )
        .join("")}
      <p class="hint">${foundAny ? "아래 칸을 확인한 뒤 저장하세요. 붙여넣은 원문은 그대로 둡니다." : "분류할 섹션을 찾지 못했습니다. 원문은 그대로 두었으니, 아래 칸에 직접 옮겨도 됩니다."}</p>
    `;

    toast(foundAny ? "자동 분석했습니다. 결과를 확인해 주세요." : "분류할 섹션을 찾지 못했습니다.");
    status.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  const saveLessonForm = async () => {
    const form = el.querySelector("#lesson-form");
    syncBookField(el);
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.bookTitle?.trim() || !data.chapter?.trim() || !data.page?.trim()) {
      toast("책 제목, Chapter, Page를 입력해 주세요.");
      return;
    }

    const saveBtn = el.querySelector("#save-lesson");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "저장 중…";
    }

    try {
      const oldIds = getLessonImageIds(existing);
      const keptIds = [];
      for (const photo of photos) {
        if (photo.file) {
          const blob = await compressImageFile(photo.file);
          const imageId = uid();
          await saveImage({
            id: imageId,
            blob,
            mimeType: blob.type || photo.file.type || "image/jpeg",
            createdAt: new Date().toISOString(),
          });
          keptIds.push(imageId);
        } else if (photo.id) {
          keptIds.push(photo.id);
        }
      }
      for (const imageId of oldIds) {
        if (!keptIds.includes(imageId)) {
          await deleteImage(imageId);
        }
      }

      const lesson = createLesson({
        existing,
        bookTitle: data.bookTitle,
        chapter: data.chapter,
        page: data.page,
        studiedAt: data.studiedAt,
        summaryKo: data.summaryKo || "",
        script: data.script || "",
        literalTranslationKo: data.literalTranslationKo || "",
        expressionsText: data.expressionsText || "",
        listeningPointsText: data.listeningPointsText || "",
        memo: data.memo || "",
        imageIds: keptIds,
      });

      await saveLesson(lesson);
      await setSetting("currentBook", lesson.bookTitle);
      toast("저장했습니다.");
      go(`#/lesson/${encodeURIComponent(lesson.id)}`);
    } catch (error) {
      console.error(error);
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = existing ? "수정 저장" : "학습자료 저장";
      }
    }
  };

  el.querySelector("#save-lesson")?.addEventListener("click", (event) => {
    event.preventDefault();
    saveLessonForm();
  });

  el.querySelector("#lesson-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveLessonForm();
  });
}
