/**
 * Future AI integration module.
 *
 * Current version does not call Gemini, ChatGPT, or any external API.
 * Users paste AI output and parseAiOutput() classifies it.
 *
 * To connect an API later:
 * 1. Implement generateFromPageImage(file) below.
 * 2. Return the same object shape as services/parser.js -> parseAiOutput().
 * 3. Wire the Add Lesson page to call this instead of (or before) paste parsing.
 */

export function isAiEnabled() {
  return false;
}

export async function generateFromPageImage(_imageFile, _options = {}) {
  throw new Error(
    "AI API is not connected in v1. Paste an external AI response and use 자동 분석하기."
  );
}
