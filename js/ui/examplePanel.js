import { fetchExamplePairs, googleExampleUrl } from "../services/examples.js?v=20260818p";
import { escapeHtml, nl2br } from "../utils.js?v=20260816p";

export function openExampleFinder({ phrase, meaning, lessons }) {
  const title = String(phrase || "").trim();
  const overlay = mountOverlay(`
    <div class="example-panel" role="dialog" aria-modal="true" aria-label="예문 찾기">
      <h2 class="example-panel-title">${escapeHtml(title)}</h2>
      ${meaning ? `<p class="example-panel-meaning">${escapeHtml(meaning)}</p>` : ""}
      <div class="example-find-list"><p class="muted">예문을 찾는 중입니다…</p></div>
      <a class="btn btn-ghost btn-wide" href="${googleExampleUrl(title)}" target="_blank" rel="noopener">구글에서 예문 찾기</a>
      <p class="hint example-panel-hint">바깥 화면을 누르면 닫힙니다.</p>
    </div>
  `);
  const list = overlay.querySelector(".example-find-list");

  fetchExamplePairs(title, lessons)
    .then((rows) => {
      if (!list.isConnected) return;
      if (!rows.length) {
        list.innerHTML = `<p class="muted">이 앱에서 바로 가져올 예문이 없습니다. 아래 구글 검색으로 예문과 해석을 찾아 보세요.</p>`;
        return;
      }
      list.innerHTML = rows.map((row) => exampleRow(row, title)).join("");
    })
    .catch(() => {
      if (!list.isConnected) return;
      list.innerHTML = `<p class="muted">예문을 가져오지 못했습니다. 아래 구글 검색을 이용해 주세요.</p>`;
    });
}

export function openExampleEditor({ phrase, example = "", exampleKo = "" } = {}) {
  return new Promise((resolve) => {
    const overlay = mountOverlay(
      `
      <form class="example-panel" role="dialog" aria-modal="true" aria-label="예문 등록">
        <h2 class="example-panel-title">예문 등록</h2>
        <p class="example-panel-meaning">${escapeHtml(phrase || "")}</p>
        <label>
          예문
          <textarea id="example-en" class="en-area" rows="6" placeholder="The ancient temple inspired awe and reverence.(그 고대 사원은 경외심과 공경심을 불러일으켰다.)">${escapeHtml(combinedExample(example, exampleKo))}</textarea>
        </label>
        <p class="hint">영어 예문과 한국어 해석을 한 칸에 같이 적어도 됩니다.</p>
        <div class="form-actions confirm-actions">
          <button type="button" class="btn btn-ghost" data-example-cancel>취소</button>
          <button type="submit" class="btn btn-play">저장</button>
        </div>
        <p class="hint example-panel-hint">바깥 화면을 누르면 닫힙니다.</p>
      </form>
    `,
      (value) => resolve(value)
    );

    const form = overlay.querySelector("form");
    const en = overlay.querySelector("#example-en");
    overlay.querySelector("[data-example-cancel]")?.addEventListener("click", () => closeOverlay(overlay, null));
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const nextEn = String(en?.value || "").trim();
      if (!nextEn) {
        en?.focus();
        return;
      }
      closeOverlay(overlay, { example: nextEn, exampleKo: "" });
    });
    en?.focus();
  });
}

function combinedExample(example, exampleKo) {
  const en = String(example || "").trim();
  const ko = String(exampleKo || "").trim();
  if (en && ko && !en.includes(ko)) return `${en}\n${ko}`;
  return en || ko;
}

function exampleRow(row, phrase) {
  return `
    <article class="example-find-item">
      <div class="item-example">${nl2br(row.en)}</div>
      ${row.ko ? `<div class="item-example-ko">${nl2br(row.ko)}</div>` : `<p class="muted">한국어 해석을 가져오지 못했습니다.</p>`}
      ${row.source ? `<div class="muted">${escapeHtml(row.source)}</div>` : ""}
    </article>
  `;
}

function mountOverlay(inner, onClose) {
  document.querySelectorAll(".example-overlay").forEach((node) => node.remove());
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay example-overlay";
  overlay.innerHTML = inner;
  const finish = (value) => {
    if (!overlay.isConnected) return;
    overlay.remove();
    window.removeEventListener("keydown", onKey);
    onClose?.(value);
  };
  overlay._close = finish;
  const onKey = (event) => {
    if (event.key === "Escape") finish(null);
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) finish(null);
  });
  window.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return overlay;
}

function closeOverlay(overlay, value) {
  overlay?._close?.(value);
}
