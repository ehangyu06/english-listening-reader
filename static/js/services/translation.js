/**
 * Future Korean translation module.
 * Translates the reconstructed Listening Script, not the original book page.
 *
 * Later: connect Gemini/OpenAI here and return { ok: true, text }.
 */

export function isTranslationAiEnabled() {
  return false;
}

export async function generateKoreanTranslation(_script, _options = {}) {
  if (!isTranslationAiEnabled()) {
    return {
      ok: false,
      message:
        "현재 자동 번역 AI가 연결되어 있지 않습니다.\nAI에서 만든 [TRANSLATION_KO] 결과를 붙여넣거나 직접 입력할 수 있습니다.",
    };
  }
  throw new Error("Translation AI is not connected.");
}
