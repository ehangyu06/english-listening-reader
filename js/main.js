import { initDb } from "./storage/db.js?v=20260825c";
import { syncLibrary } from "./storage/sync.js?v=20260826c";
import { removeSampleLesson } from "./data/sample.js?v=20260825c";
import { parseRoute, startRouter } from "./router.js?v=20260818k";
import { renderApp } from "./app.js?v=20260826e";
import { bindLightboxHistory } from "./pages/lightbox.js?v=20260816w";
import { bindDeleteClicks } from "./pages/deletes.js?v=20260825c";
import { bindTitleEdit } from "./pages/titleEdit.js?v=20260825c";
import { bindNowPlaying } from "./ui/nowPlaying.js?v=20260826e";
import { go } from "./utils.js?v=20260816p";

function watchKeyboard() {
  const viewport = window.visualViewport;
  const apply = () => {
    const height = viewport ? Math.round(viewport.height) : window.innerHeight;
    const covered = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    document.documentElement.style.setProperty("--app-vh", `${height}px`);
    document.documentElement.style.setProperty("--keyboard", `${covered}px`);
  };
  if (viewport) {
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
  }
  window.addEventListener("resize", apply);
  apply();
}

async function boot() {
  watchKeyboard();
  bindLightboxHistory();
  await initDb();
  await removeSampleLesson();

  const app = document.getElementById("app");
  bindNowPlaying();
  bindDeleteClicks(app, renderApp);
  bindTitleEdit(app, renderApp);
  app.addEventListener("click", (event) => {
    if (event.target.closest("[data-delete-lesson], [data-delete-book]")) return;
    const link = event.target.closest("[data-go]");
    if (!link) return;
    event.preventDefault();
    go(link.dataset.go);
  });

  startRouter(renderApp);
  try {
    await syncLibrary();
    await renderApp(parseRoute());
  } catch (error) {
    console.warn(error);
  }
}

boot().catch((error) => {
  console.error(error);
  document.getElementById("app").innerHTML = `
    <div class="page">
      <h1>English Listening Reader</h1>
      <p class="muted">앱을 시작하지 못했습니다. 아이패드 Safari에서 이 사이트의 다른 탭을 모두 닫고, 주소를 다시 열어 주세요.</p>
    </div>
  `;
});
