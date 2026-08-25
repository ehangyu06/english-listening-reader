import { deleteLesson, deleteBook, getLesson, getLessonsByBook } from "../storage/lessons.js?v=20260825c";
import { parseRoute } from "../router.js?v=20260816p";
import { askConfirm } from "../ui/confirm.js?v=20260816p";
import { toast } from "../utils.js?v=20260816p";

export function bindDeleteClicks(app, renderApp) {
  app.addEventListener(
    "click",
    async (event) => {
      const pageBtn = event.target.closest("[data-delete-lesson]");
      if (pageBtn) {
        event.preventDefault();
        event.stopPropagation();
        const id = pageBtn.dataset.deleteLesson;
        if (!id) return;
        const ok = await askConfirm("이 페이지의 학습 내용을 삭제할까요? Script, 사진, 오디오가 함께 지워집니다.");
        if (!ok) return;
        try {
          const lesson = await getLesson(id);
          await deleteLesson(id);
          toast("삭제했습니다.");
          const route = parseRoute();
          if (route.name === "lesson" && route.id === id) {
            location.hash = lesson?.bookTitle ? `#/books/${encodeURIComponent(lesson.bookTitle)}` : "#/";
          } else {
            await renderApp(parseRoute());
          }
        } catch (error) {
          console.error(error);
          toast("삭제하지 못했습니다. 다시 눌러 주세요.");
        }
        return;
      }

      const bookBtn = event.target.closest("[data-delete-book]");
      if (bookBtn) {
        event.preventDefault();
        event.stopPropagation();
        const name = bookBtn.dataset.deleteBook;
        if (!name) return;
        const pages = await getLessonsByBook(name);
        const ok = await askConfirm(
          pages.length
            ? `“${name}” 책의 학습 내용을 모두 삭제할까요? 되돌릴 수 없습니다.`
            : `선택 목록에서 “${name}” 제목을 삭제할까요?`
        );
        if (!ok) return;
        try {
          await deleteBook(name);
          toast("책을 삭제했습니다.");
          const route = parseRoute();
          if (route.name === "book" && route.title === name) {
            location.hash = "#/books";
          } else {
            await renderApp(parseRoute());
          }
        } catch (error) {
          console.error(error);
          toast("삭제하지 못했습니다. 다시 눌러 주세요.");
        }
      }
    },
    true
  );
}
