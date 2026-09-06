import { getAllLessons } from "../storage/lessons.js?v=20260906q";
import { buildWordIndex, searchSimilarWords } from "../services/wordSearch.js?v=20260906k";
import { loadSearchQueryState, saveSearchJump, saveSearchQueryState } from "../storage/searchJump.js?v=20260818k";
import { escapeHtml, go } from "../utils.js?v=20260816p";

export async function renderSearch(el) {
  const lessons = await getAllLessons();
  const index = buildWordIndex(lessons);
  const saved = loadSearchQueryState() || {};
  let query = String(saved.query || "");
  let selectedKey = String(saved.selectedKey || "");

  el.innerHTML = `
    <div class="search-page">
      <p class="lead">중요 표현을 먼저 찾고, 그다음 원문에서 비슷한 단어를 보여 줍니다. 숙어를 통째로 넣어도 됩니다.</p>
      <label class="search-field">
        단어 · 숙어 검색
        <input
          id="word-search-input"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="예: be utterly unfazed"
          value="${escapeHtml(query)}"
        />
      </label>
      <div id="search-results"></div>
    </div>
  `;

  const input = el.querySelector("#word-search-input");
  const results = el.querySelector("#search-results");
  let timer = 0;

  const persist = () => saveSearchQueryState({ query, selectedKey });

  const openHit = (word, hit) => {
    saveSearchJump({
      lessonId: hit.lessonId,
      word,
      sentence: hit.sentence,
      itemId: hit.itemId || "",
    });
    persist();
    go(`#/lesson/${encodeURIComponent(hit.lessonId)}?from=search`);
  };

  const draw = () => {
    if (!index.size) {
      results.innerHTML = `<div class="empty">아직 검색할 내용이 없습니다. 학습자료나 중요 표현을 먼저 추가해 주세요.</div>`;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      selectedKey = "";
      persist();
      results.innerHTML = `<div class="empty">두 글자 이상 입력하면 비슷한 단어를 보여 줍니다.</div>`;
      return;
    }

    const matches = searchSimilarWords(index, q);
    if (!matches.length) {
      selectedKey = "";
      persist();
      results.innerHTML = `<div class="empty">비슷한 단어를 찾지 못했습니다. 다른 철자로 다시 입력해 보세요.</div>`;
      return;
    }

    if (selectedKey && !matches.some((row) => row.key === selectedKey)) selectedKey = "";
    persist();

    if (selectedKey) {
      const chosen = matches.find((row) => row.key === selectedKey);
      results.innerHTML = sentenceListMarkup(chosen);
      results.querySelector("[data-back-words]")?.addEventListener("click", () => {
        selectedKey = "";
        persist();
        draw();
      });
      results.querySelectorAll("[data-open-hit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-open-hit"));
          const hit = chosen.hits[i];
          if (hit) openHit(chosen.word, hit);
        });
      });
      return;
    }

    results.innerHTML = `<div class="stack">${matches.map(wordCard).join("")}</div>`;

    const openWordResult = (key) => {
      const chosen = matches.find((row) => row.key === key);
      if (!chosen?.hits?.length) return;
      if (chosen.hits.length === 1) {
        openHit(chosen.word, chosen.hits[0]);
        return;
      }
      selectedKey = key;
      persist();
      draw();
    };

    results.querySelectorAll("[data-word-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openWordResult(btn.getAttribute("data-word-key") || "");
      });
    });
    results.querySelectorAll("[data-open-places]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openWordResult(btn.getAttribute("data-open-places") || "");
      });
    });
  };

  input?.addEventListener("input", () => {
    query = String(input.value || "");
    selectedKey = "";
    persist();
    window.clearTimeout(timer);
    timer = window.setTimeout(draw, 120);
  });

  draw();
  if (!query) input?.focus();
}

function wordCard(entry) {
  const first = entry.hits[0];
  const many = entry.hits.length > 1;
  const extra = many ? ` · ${entry.hits.length}곳` : "";
  const actionLabel = many ? `${entry.hits.length}곳 보기` : "페이지로";
  const title =
    entry.kind === "phrase"
      ? `<div class="search-word">${escapeHtml(entry.word)}</div><div class="search-phrase-tag">중요 표현</div>`
      : `<div class="search-word">${escapeHtml(entry.word)}</div>`;
  return `
    <article class="card search-hit-card">
      <button type="button" class="search-hit-main" data-word-key="${escapeHtml(entry.key)}">
        ${title}
        <div class="search-snippet">${markedSnippet(first?.sentence || "", entry.kind === "phrase" ? "" : entry.word)}</div>
      </button>
      <div class="search-hit-meta">
        <span class="muted">${escapeHtml(placesSummary(entry))}${extra}</span>
        <button type="button" class="text-btn" data-open-places="${escapeHtml(entry.key)}">${actionLabel}</button>
      </div>
    </article>
  `;
}

function sentenceListMarkup(entry) {
  return `
    <div class="search-sentence-head">
      <button type="button" class="text-btn" data-back-words>← 비슷한 단어</button>
      <div class="search-word">${escapeHtml(entry.word)}</div>
      <p class="hint">나온 곳을 고르면 해당 페이지로 이동합니다. 중요 표현과 원문이 함께 있을 수 있습니다.</p>
    </div>
    <div class="stack">${entry.hits
      .map(
        (hit, index) => `
          <article class="card search-hit-card">
            <button type="button" class="search-hit-main" data-open-hit="${index}">
              <div class="search-snippet">${markedSnippet(hit.sentence, entry.word)}</div>
            </button>
            <div class="search-hit-meta">
              <span class="muted">${escapeHtml(placeLabel(hit))}</span>
              <button type="button" class="text-btn" data-open-hit="${index}">페이지로</button>
            </div>
          </article>
        `
      )
      .join("")}</div>
  `;
}

function markedSnippet(sentence, word) {
  const text = escapeHtml(String(sentence || "").replace(/\s+/g, " ").trim());
  const needle = escapeHtml(word || "");
  if (!needle) return text;
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  return text.replace(re, (match) => `<mark class="review-mark">${match}</mark>`);
}

function placesSummary(entry) {
  const first = entry?.hits?.[0];
  if (!first) return "";
  const place = `${first.bookTitle} · ${first.chapter} · Page ${first.page}`;
  const expr = (entry.hits || []).filter((hit) => hit.source === "expression").length;
  const script = (entry.hits || []).length - expr;
  if (expr && script) return `${place} · 중요 표현 ${expr} · 원문 ${script}`;
  if (expr) return `${place} · 중요 표현`;
  return place;
}

function placeLabel(hit) {
  if (!hit) return "";
  const place = `${hit.bookTitle} · ${hit.chapter} · Page ${hit.page}`;
  return hit.source === "expression" ? `${place} · 중요 표현` : `${place} · 원문`;
}
