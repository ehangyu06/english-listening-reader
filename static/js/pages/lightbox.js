let open = false;
let urls = [];
let index = 0;

export function isLightboxOpen() {
  return open;
}

export function closeLightbox() {
  document.querySelectorAll(".lightbox").forEach((node) => node.remove());
  open = false;
  urls = [];
  index = 0;
}

export function openLightbox(source, startIndex = 0) {
  closeLightbox();
  urls = (Array.isArray(source) ? source : [source]).filter(Boolean);
  if (!urls.length) return;
  index = Math.min(Math.max(0, startIndex), urls.length - 1);

  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.innerHTML = `
    ${urls.length > 1 ? `<div class="lightbox-count" id="lightbox-count"></div>` : ""}
    <button type="button" class="lightbox-close" aria-label="사진 닫기">사진 닫기</button>
    ${
      urls.length > 1
        ? `<button type="button" class="lightbox-nav lightbox-prev" aria-label="이전 사진">‹</button>
           <button type="button" class="lightbox-nav lightbox-next" aria-label="다음 사진">›</button>`
        : ""
    }
    <img alt="원본 페이지">
  `;

  const img = overlay.querySelector("img");
  const count = overlay.querySelector("#lightbox-count");
  const show = () => {
    img.src = urls[index];
    overlay.classList.remove("is-zoomed");
    if (count) count.textContent = `${index + 1} / ${urls.length}`;
  };

  const dismiss = () => {
    const shouldPop = Boolean(history.state?.lightbox);
    closeLightbox();
    if (shouldPop) history.back();
  };

  overlay.querySelector(".lightbox-close").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  });
  overlay.querySelector(".lightbox-prev")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    index = (index - 1 + urls.length) % urls.length;
    show();
  });
  overlay.querySelector(".lightbox-next")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    index = (index + 1) % urls.length;
    show();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });
  img.addEventListener("click", (event) => {
    event.stopPropagation();
    overlay.classList.toggle("is-zoomed");
  });

  document.body.appendChild(overlay);
  show();
  open = true;
  history.pushState({ lightbox: true }, "", location.href);
}

export function bindLightboxHistory() {
  window.addEventListener("popstate", () => {
    if (open) closeLightbox();
  });
}
