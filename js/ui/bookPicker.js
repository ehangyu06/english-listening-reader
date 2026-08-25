import { escapeHtml, go } from "../utils.js?v=20260816p";

export function openBookPicker({ titles = [], current = "" } = {}) {
  return new Promise((resolve) => {
    document.querySelectorAll(".picker-overlay").forEach((node) => node.remove());
    const overlay = document.createElement("div");
    overlay.className = "picker-overlay";
    const list = titles.length
      ? titles
          .map(
            (title) => `
        <button type="button" class="book-pick-item ${title === current ? "is-active" : ""}" data-pick="${escapeHtml(title)}">
          ${escapeHtml(title)}
        </button>`
          )
          .join("")
      : `<div class="empty">저장된 책 제목이 없습니다.</div>`;

    overlay.innerHTML = `
      <div class="picker-card" role="dialog" aria-modal="true" aria-label="책 제목 선택">
        <div class="picker-head">
          <h2>책 제목 선택</h2>
          <button type="button" class="text-btn" data-picker-close>닫기</button>
        </div>
        <p class="hint">스크롤해서 제목을 고르세요. 지금 보고 있는 페이지만 바뀝니다.</p>
        <div class="picker-scroll">${list}</div>
        <button type="button" class="btn btn-ghost btn-wide" data-picker-manage>책 이름 수정·삭제</button>
      </div>
    `;

    const done = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) done(null);
    });
    overlay.querySelector("[data-picker-close]")?.addEventListener("click", () => done(null));
    overlay.querySelector("[data-picker-manage]")?.addEventListener("click", () => {
      overlay.remove();
      go("#/books");
      resolve(null);
    });
    overlay.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        done(btn.getAttribute("data-pick") || "");
      });
    });

    document.body.appendChild(overlay);
    overlay.querySelector(".book-pick-item.is-active")?.scrollIntoView({ block: "center" });
  });
}
