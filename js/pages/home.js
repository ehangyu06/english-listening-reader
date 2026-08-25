import { getAllLessons, hasAudio } from "../storage/lessons.js?v=20260825c";
import { getSetting } from "../storage/db.js?v=20260825c";
import { remoteStatus } from "../storage/remote.js?v=20260826a";
import { isCloudEnabled } from "../storage/cloud.js?v=20260826a";
import { clearCloudConfig, getCloudConfig, saveCloudConfig } from "../config.js?v=20260826a";
import { scriptPreviewLines } from "../services/parser.js?v=20260816p";
import { escapeHtml, formatDate, toast } from "../utils.js?v=20260816p";

export async function renderHome(el) {
  const lessons = await getAllLessons();
  const currentBook = (await getSetting("currentBook", "")) || lessons[0]?.bookTitle || "";
  const recent = lessons.slice(0, 24);
  const currentCount = lessons.filter((lesson) => lesson.bookTitle === currentBook).length;

  el.innerHTML = `
    <section class="hero">
      <p class="eyebrow">개인 영어 리스닝 학습</p>
      <p class="lead">페이지를 이해한 뒤, 재구성한 영어로 듣습니다.</p>
      <p class="muted">새 기능: 페이지에 영어 오디오 파일을 올려 반복해서 듣기</p>
    </section>
    <div id="cloud-status"></div>
    <div id="ipad-guide"></div>

    ${
      currentBook
        ? `<a class="card current-book" href="#/books/${encodeURIComponent(currentBook)}">
            <div class="muted">현재 책</div>
            <div class="current-title">${escapeHtml(currentBook)}</div>
            <div class="muted">${currentCount} pages studied</div>
          </a>`
        : ""
    }

    <section class="section">
      <div class="section-head">
        <h2>최근 학습</h2>
        <button class="text-btn" data-go="#/lesson/new">+ 새 페이지</button>
      </div>
      ${
        recent.length
          ? `<div class="stack">${recent.map(lessonCard).join("")}</div>`
          : `<div class="empty">아직 학습자료가 없습니다. 새 페이지를 추가해 보세요.</div>`
      }
    </section>
  `;

  renderCloudStatus(el.querySelector("#cloud-status"));
  renderIpadGuide(el.querySelector("#ipad-guide"));
}

function cloudFormMarkup(config) {
  const url = escapeHtml(config.supabaseUrl || "");
  return `
    <form id="cloud-connect-form" class="cloud-connect">
      <label>
        Project URL
        <input id="cloud-url" enterkeyhint="done" autocomplete="off" placeholder="https://xxxx.supabase.co" value="${url}" />
      </label>
      <label>
        anon public 키
        <textarea id="cloud-anon" class="en-area" rows="3" placeholder="eyJ... (anon public, service_role 아님)"></textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn-play">클라우드 연결</button>
      </div>
    </form>
  `;
}

function bindCloudForm(mount) {
  const form = mount.querySelector("#cloud-connect-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const supabaseUrl = String(mount.querySelector("#cloud-url")?.value || "").trim();
    const supabaseAnonKey = String(mount.querySelector("#cloud-anon")?.value || "").trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      toast("Project URL과 anon 키를 모두 넣어 주세요.");
      return;
    }
    saveCloudConfig({ supabaseUrl, supabaseAnonKey });
    toast("클라우드 정보를 저장했습니다. 연결을 확인합니다.");
    location.reload();
  });
  mount.querySelector("#cloud-disconnect")?.addEventListener("click", () => {
    clearCloudConfig();
    toast("이 기기의 클라우드 연결을 지웠습니다.");
    location.reload();
  });
}

async function renderCloudStatus(mount) {
  if (!mount) return;
  const status = await remoteStatus();
  const config = getCloudConfig();
  if (status.cloud) {
    mount.innerHTML = `
      <section class="card cloud-card is-ok">
        <div class="block-title">클라우드 연결됨</div>
        <p class="hint">집과 직장에서 같은 학습자료를 봅니다. 맥이 꺼져 있어도 브라우저만 있으면 됩니다.</p>
        <button type="button" class="text-btn" id="cloud-disconnect">이 기기 연결 해제</button>
      </section>
    `;
    bindCloudForm(mount);
    return;
  }
  if (status.mac) {
    mount.innerHTML = `
      <section class="card cloud-card">
        <div class="block-title">${isCloudEnabled() ? "클라우드는 아직 응답하지 않습니다" : "맥 공유 저장소"}</div>
        <p class="hint">${
          isCloudEnabled()
            ? "집 맥과 아이패드는 지금처럼 사용할 수 있습니다. URL과 anon 키를 다시 확인하거나, SQL을 실행했는지 봐 주세요."
            : "지금은 이 맥에만 저장됩니다. 직장에서 보려면 아래 칸에 Supabase 값을 넣으세요."
        }</p>
        <p class="hint">supabase.com → 영어 회화 프로젝트 → SQL Editor에 <code>supabase/setup.sql</code> 실행 후, Settings → API의 Project URL과 anon public 키를 붙여넣으세요.</p>
        ${cloudFormMarkup(config)}
      </section>
    `;
    bindCloudForm(mount);
    return;
  }
  if (isCloudEnabled()) {
    mount.innerHTML = `
      <section class="card cloud-card is-warn">
        <div class="block-title">클라우드에 연결하지 못했습니다</div>
        <p class="hint">네트워크나 Supabase 프로젝트 상태를 확인해 주세요. 이 기기에 이미 받아 둔 학습자료는 그대로 볼 수 있습니다.</p>
        ${cloudFormMarkup(config)}
        <button type="button" class="text-btn" id="cloud-disconnect">이 기기 연결 해제</button>
      </section>
    `;
    bindCloudForm(mount);
    return;
  }
  mount.innerHTML = `
    <section class="card cloud-card is-warn">
      <div class="block-title">클라우드가 아직 연결되지 않았습니다</div>
      <p class="hint">supabase.com → SQL Editor에 <code>supabase/setup.sql</code> 실행 후, Project URL과 anon public 키를 붙여넣으면 직장에서도 같은 자료를 볼 수 있습니다.</p>
      ${cloudFormMarkup(config)}
    </section>
  `;
  bindCloudForm(mount);
}

async function renderIpadGuide(mount) {
  if (!mount) return;
  const host = location.hostname;
  const alreadyOnLan = host !== "127.0.0.1" && host !== "localhost";
  if (alreadyOnLan || sessionStorage.getItem("hideIpadGuide") === "1") return;

  let url = "";
  let lanUrl = "";
  try {
    const res = await fetch("/__lan.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      url = data.bonjourUrl || data.url || "";
      lanUrl = data.url && data.url !== url ? data.url : "";
    }
  } catch {
    url = "";
  }
  if (!url) return;

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
  mount.innerHTML = `
    <section class="card ipad-card">
      <div class="ipad-card-top">
        <div>
          <div class="block-title">아이패드에서 보기</div>
          <p class="hint">같은 Wi-Fi에서 아래 주소를 북마크하세요. IP가 바뀌어도 이 주소는 그대로입니다. 맥이 켜져 있으면 서버가 자동으로 켜집니다.</p>
        </div>
        <button type="button" class="text-btn" id="hide-ipad-guide">안내 닫기</button>
      </div>
      <div class="ipad-url">${escapeHtml(url.replace(/^https?:\/\//, ""))}</div>
      ${lanUrl ? `<p class="muted">백업 주소: ${escapeHtml(lanUrl.replace(/^https?:\/\//, ""))}</p>` : ""}
      <img class="ipad-qr" src="${qr}" alt="아이패드 접속 QR">
    </section>
  `;
  mount.querySelector("#hide-ipad-guide")?.addEventListener("click", () => {
    sessionStorage.setItem("hideIpadGuide", "1");
    mount.innerHTML = "";
  });
}

export function lessonCard(lesson) {
  return `
    <div class="card lesson-card">
      <a class="lesson-card-link" href="#/lesson/${encodeURIComponent(lesson.id)}">
        <div class="lesson-card-top">
          <div class="lesson-book">${escapeHtml(lesson.bookTitle)}</div>
          ${lesson.completed ? `<span class="check">✓</span>` : ""}
        </div>
        <div class="lesson-line">${escapeHtml(lesson.chapter)} · Page ${escapeHtml(lesson.page)}${hasAudio(lesson) ? `<span class="audio-badge" title="오디오 있음">🎧</span>` : ""}</div>
        ${scriptPreview(lesson.script)}
        <div class="muted">${formatDate(lesson.studiedAt || lesson.updatedAt)}</div>
      </a>
      <div class="card-side-actions">
        <button type="button" class="text-btn" data-edit-page-title="${escapeHtml(lesson.id)}">제목 수정</button>
        <button type="button" class="btn-delete" data-delete-lesson="${escapeHtml(lesson.id)}">삭제</button>
      </div>
      <form class="title-editor meta-editor lesson-card-title-form" data-page-title-form="${escapeHtml(lesson.id)}">
        <label>
          이 페이지의 책 제목
          <input enterkeyhint="done" autocomplete="off" data-page-title-input value="${escapeHtml(lesson.bookTitle)}" />
        </label>
        <p class="hint">이 페이지만 바뀝니다. 다른 학습자료는 그대로입니다.</p>
        <div class="form-actions">
          <button type="submit" class="btn btn-play">저장</button>
          <button type="button" class="btn btn-ghost" data-cancel-page-title>취소</button>
        </div>
      </form>
    </div>
  `;
}

export function scriptPreview(script) {
  const lines = scriptPreviewLines(script, 3);
  if (!lines.length) return "";
  const clamp = lines.length === 1 ? " is-paragraph" : "";
  return `<div class="script-preview${clamp}">${lines
    .map((line) => `<div class="script-preview-line">${escapeHtml(line)}</div>`)
    .join("")}</div>`;
}
