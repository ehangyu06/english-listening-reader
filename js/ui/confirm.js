export function askConfirm(message, { confirmLabel = "삭제", cancelLabel = "취소" } = {}) {
  return new Promise((resolve) => {
    document.querySelectorAll(".confirm-overlay").forEach((node) => node.remove());
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-card" role="dialog" aria-modal="true">
        <p class="confirm-text"></p>
        <div class="form-actions confirm-actions">
          <button type="button" class="btn btn-ghost" data-confirm="no">${cancelLabel}</button>
          <button type="button" class="btn btn-play" data-confirm="yes">${confirmLabel}</button>
        </div>
      </div>
    `;
    overlay.querySelector(".confirm-text").textContent = message;
    const done = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) done(false);
    });
    overlay.querySelector("[data-confirm='no']").addEventListener("click", () => done(false));
    overlay.querySelector("[data-confirm='yes']").addEventListener("click", () => done(true));
    document.body.appendChild(overlay);
    overlay.querySelector("[data-confirm='yes']").focus();
  });
}
