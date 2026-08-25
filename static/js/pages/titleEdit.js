import { renameBook, updateLessonMeta } from "../storage/lessons.js?v=20260825c";
import { parseRoute } from "../router.js?v=20260816p";
import { toast } from "../utils.js?v=20260816p";

export function bindTitleEdit(app, renderApp) {
  app.addEventListener(
    "click",
    async (event) => {
      const pageEditBtn = event.target.closest("[data-edit-page-title]");
      if (pageEditBtn) {
        event.preventDefault();
        event.stopPropagation();
        const id = pageEditBtn.getAttribute("data-edit-page-title") || "";
        app.querySelectorAll("[data-page-title-form]").forEach((form) => {
          form.classList.toggle("is-open", form.getAttribute("data-page-title-form") === id);
        });
        const form = [...app.querySelectorAll("[data-page-title-form]")].find(
          (node) => node.getAttribute("data-page-title-form") === id
        );
        form?.querySelector("[data-page-title-input]")?.focus();
        form?.scrollIntoView({ block: "nearest" });
        return;
      }

      const cancelPageBtn = event.target.closest("[data-cancel-page-title]");
      if (cancelPageBtn) {
        event.preventDefault();
        event.stopPropagation();
        cancelPageBtn.closest("[data-page-title-form]")?.classList.remove("is-open");
        return;
      }

      const openBtn = event.target.closest("[data-edit-title]");
      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();
        if (parseRoute().name !== "book") return;
        const form = document.getElementById("book-title-form");
        const input = document.getElementById("book-title-input");
        if (!form || !input) return;
        form.classList.add("is-open");
        form.hidden = false;
        input.value = openBtn.getAttribute("data-edit-title") || input.value;
        form.setAttribute("data-old-title", input.value);
        form.scrollIntoView({ block: "nearest" });
        return;
      }

      const cancelBtn = event.target.closest("[data-cancel-title]");
      if (cancelBtn) {
        event.preventDefault();
        event.stopPropagation();
        const form = document.getElementById("book-title-form");
        form?.classList.remove("is-open");
        return;
      }

      const saveBtn = event.target.closest("[data-save-title]");
      if (!saveBtn) return;
      event.preventDefault();
      event.stopPropagation();
      if (parseRoute().name !== "book") return;

      const form = document.getElementById("book-title-form");
      const input = document.getElementById("book-title-input");
      const next = String(input?.value || "").trim();
      const prev = String(form?.getAttribute("data-old-title") || saveBtn.getAttribute("data-old-title") || "").trim();
      if (!next) {
        toast("책 제목을 입력해 주세요.");
        return;
      }
      try {
        const saved = await renameBook(prev, next);
        toast("책 제목을 수정했습니다.");
        const route = parseRoute();
        if (route.name === "book") {
          location.hash = `#/books/${encodeURIComponent(saved)}`;
        } else {
          await renderApp(parseRoute());
        }
      } catch (error) {
        console.error(error);
        toast("제목을 수정하지 못했습니다. 다시 시도해 주세요.");
      }
    },
    true
  );

  app.addEventListener(
    "submit",
    async (event) => {
      const form = event.target.closest("[data-page-title-form]");
      if (!form) return;
      event.preventDefault();
      event.stopPropagation();
      const id = form.getAttribute("data-page-title-form") || "";
      const next = String(form.querySelector("[data-page-title-input]")?.value || "").trim();
      if (!id) return;
      if (!next) {
        toast("책 제목을 입력해 주세요.");
        return;
      }
      try {
        await updateLessonMeta(id, { bookTitle: next });
        toast("이 페이지의 제목을 수정했습니다.");
        await renderApp(parseRoute());
      } catch (error) {
        console.error(error);
        toast("제목을 수정하지 못했습니다. 다시 시도해 주세요.");
      }
    },
    true
  );
}
