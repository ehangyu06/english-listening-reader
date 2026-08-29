import { parseLiteralTranslation, scriptPartKindLabel } from "../services/parser.js?v=20260829b";
import { escapeHtml, nl2br } from "../utils.js?v=20260816q";

export function renderLiteralTranslationHtml(text, emptyMessage = "아직 한글 직역이 없습니다.") {
  const raw = String(text || "").trim();
  const structured = translationScenesBody(raw);
  if (structured) return structured;
  if (raw) return `<div class="card prose compare-text">${nl2br(raw)}</div>`;
  return `<div class="muted">${emptyMessage}</div>`;
}

function translationScenesBody(text) {
  const scenes = parseLiteralTranslation(text).filter(
    (scene) => scene.lines?.length || String(scene.prose || "").trim()
  );
  const hasNotes = scenes.some((scene) => scene.lines?.some((line) => line.literal || line.idiomatic));
  if (!hasNotes) return "";
  return scenes
    .map((scene) => {
      const lines = (scene.lines || [])
        .map((line) => {
          const speaker = line.speaker
            ? `<span class="compare-speaker">${escapeHtml(line.speaker)}:</span> `
            : "";
          const en = line.en ? `<div class="compare-line-en">${speaker}${formatInline(line.en)}</div>` : "";
          const ko = line.literal ? `<div class="compare-line-ko">${formatInline(line.literal)}</div>` : "";
          const note = line.idiomatic
            ? `<div class="compare-line-note">${formatInline(line.idiomatic)}</div>`
            : "";
          return `<div class="compare-line">${en}${ko}${note}</div>`;
        })
        .join("");
      const prose = scene.prose ? `<div class="compare-text">${nl2br(scene.prose)}</div>` : "";
      return `
        <article class="card part-card compare-part">
          <div class="part-label">${partHeading(scene)}</div>
          ${lines}${prose}
        </article>
      `;
    })
    .join("");
}

function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function partHeading(part) {
  const label = scriptPartKindLabel(part);
  return part.title ? `${label}<span class="part-title">${escapeHtml(part.title)}</span>` : label;
}
