import { uid, hasHangul } from "../utils.js?v=20260816p";

const SECTION_DEFS = [
  {
    key: "listeningPoints",
    labels: [
      "listening points",
      "listening point",
      "listening tips",
      "pronunciation points",
      "pronunciation tips",
      "연음 및 리스닝 핵심 포인트",
      "리스닝 핵심 포인트",
      "리스닝 포인트",
      "발음 포인트",
      "연음 포인트",
      "듣기 포인트",
      "listening_points",
      "listeningpoints",
    ],
  },
  {
    key: "expressions",
    labels: [
      "important expressions",
      "important expression",
      "key expressions",
      "key expression",
      "useful expressions",
      "useful expression",
      "key phrases",
      "vocabulary",
      "vocab",
      "expressions",
      "expression",
      "중요 표현",
      "주요 표현",
      "핵심 표현",
      "중요 어구",
      "중요어구",
      "핵심 어구",
      "주요 어구",
    ],
  },
  {
    key: "script",
    labels: [
      "listening practice script",
      "reconstructed script",
      "rewritten script",
      "practice script",
      "listening script",
      "english script",
      "script",
      "리스닝 스크립트",
      "영어 스크립트",
      "재구성 영문",
      "재구성 영어",
    ],
  },
  {
    key: "literalTranslationKo",
    labels: [
      "translation ko",
      "translation_ko",
      "translationko",
      "literal translation ko",
      "literal_translation_ko",
      "korean literal translation",
      "literal translation",
      "korean translation",
      "한글 직역",
      "한국어 직역",
      "한글 번역",
      "한국어 번역",
      "직역",
    ],
  },
  {
    key: "summaryKo",
    labels: [
      "summary ko",
      "summary_ko",
      "summaryko",
      "korean summary",
      "summary",
      "내용 요약",
      "한국어 요약",
      "한국어 내용",
      "내용 이해",
      "페이지 내용",
      "줄거리",
      "해석",
      "한국어",
    ],
  },
  {
    key: "memo",
    labels: ["memo", "note", "notes", "메모", "노트"],
  },
];

const EXACT_ONLY = new Set([
  "script",
  "summary",
  "expressions",
  "expression",
  "vocabulary",
  "vocab",
  "memo",
  "note",
  "notes",
  "korean",
  "직역",
  "번역",
  "해석",
  "한국어",
  "표현",
]);

const BRACKET_TAGS = [
  { key: "summaryKo", re: /^summary[_\s-]*ko$/i },
  { key: "script", re: /^(?:listening\s*)?script$/i },
  { key: "expressions", re: /^(?:important\s*)?expressions?$|^중요\s*어구$/i },
  { key: "listeningPoints", re: /^listening[_\s-]*points?$/i },
  { key: "literalTranslationKo", re: /^(?:literal\s*)?translation[_\s-]*ko$/i },
  { key: "memo", re: /^memo$/i },
];

function splitLines(text) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n");
}

function stripDecor(line) {
  return String(line || "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^[=_*\-—]{2,}\s*|\s*[=_*\-—]{2,}$/g, "")
    .trim();
}

function normalizeHeader(line) {
  return stripDecor(line)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/[:：]\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function coreHeader(line) {
  return normalizeHeader(line)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPartOrSectionLine(line) {
  return /^(?:#{1,3}\s*)?(?:\*\*)?(?:part|section)\s+\d+\s*[:.\-–—)]/i.test(String(line || "").trim());
}

function matchBracketTag(line) {
  const stripped = stripDecor(line);
  const bracket = stripped.match(/^\[([^\]]+)\]$/);
  if (!bracket) return null;
  const inner = bracket[1].trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  for (const tag of BRACKET_TAGS) {
    if (tag.re.test(inner)) return tag.key;
  }
  return null;
}

function matchNaturalHeader(line) {
  if (isPartOrSectionLine(line)) return null;
  const raw = stripDecor(line);
  if (!raw || raw.length > 90) return null;
  if (raw.length > 70 && /[.!?。]$/.test(raw)) return null;

  const core = coreHeader(raw);
  if (!core) return null;

  let best = null;
  let bestLen = 0;
  for (const def of SECTION_DEFS) {
    for (const label of def.labels) {
      const hit =
        core === label ||
        (!EXACT_ONLY.has(label) &&
          (core.startsWith(`${label} `) ||
            core.startsWith(`${label}:`) ||
            (core.includes(label) && core.length <= label.length + 24)));
      if (hit && label.length > bestLen) {
        best = def.key;
        bestLen = label.length;
      }
    }
  }
  return best;
}

export function detectSectionHeader(line) {
  return matchBracketTag(line) || matchNaturalHeader(line);
}

export function detectSections(text) {
  const lines = splitLines(text);
  const marks = [];
  lines.forEach((line, index) => {
    const key = detectSectionHeader(line);
    if (key) marks.push({ key, index, header: line.trim() });
  });
  return marks;
}

function collectBuckets(text) {
  const lines = splitLines(text);
  const marks = detectSections(text);
  const buckets = {
    summaryKo: [],
    script: [],
    literalTranslationKo: [],
    expressions: [],
    listeningPoints: [],
    memo: [],
    leftover: [],
  };

  if (!marks.length) {
    buckets.leftover = lines;
    return { buckets, marks };
  }

  let markPos = 0;
  let current = "leftover";
  for (let i = 0; i < lines.length; i += 1) {
    if (markPos < marks.length && marks[markPos].index === i) {
      current = marks[markPos].key;
      markPos += 1;
      continue;
    }
    buckets[current].push(lines[i]);
  }
  return { buckets, marks };
}

function hangulRatio(text) {
  const chars = String(text || "").replace(/\s/g, "");
  if (!chars) return 0;
  return (chars.match(/[\uac00-\ud7a3]/g) || []).length / chars.length;
}

const EXPR_FIELD_RE =
  /^(뜻|의미|해석|meaning|예문|예문 해석|example|활용|용법|설명|note|usage)\s*[:：]\s*(.*)$/i;

function parseLabeledExprField(line) {
  const text = unwrapExprLine(line);
  const match = text.match(EXPR_FIELD_RE);
  if (!match) return null;
  const label = String(match[1] || "").trim();
  const value = String(match[2] || "").trim();
  if (/^(뜻|의미|해석|meaning)$/i.test(label)) return { key: "meaning", value };
  if (/^(예문|예문 해석|example)$/i.test(label)) return { key: "example", value };
  return { key: "note", value };
}

function isExprCategoryLine(line) {
  const text = unwrapExprLine(line);
  if (!text || /[A-Za-z]/.test(text)) return false;
  if (parseLabeledExprField(text) || isMeaningOnlyLine(text)) return false;
  if (/(관련 표현|핵심 표현|주요 표현|다음과 같|정리하면|카테고리)/.test(text)) return true;
  return false;
}

function looksLikeExpressionLine(line) {
  const trimmed = String(line || "")
    .replace(/^\s*[-*•∙·]\s*/, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .trim();
  if (!trimmed || isPartOrSectionLine(trimmed) || detectSectionHeader(trimmed)) return false;
  if (parseLabeledExprField(trimmed)) return false;
  if (/→|➜|➡|->|=>|\|/.test(trimmed)) return true;
  if (/^\*\*(.+?)\*\*/.test(trimmed)) return true;
  if (/^[^:]{1,80}[:：]\s+\S/.test(trimmed) && hasHangul(trimmed) && !EXPR_FIELD_RE.test(trimmed)) return true;
  return false;
}

function inferThreeBlocks(text, result) {
  if (result.script && result.literalTranslationKo && result.expressions.length) {
    return result;
  }

  const source = String(text || "").trim();
  if (!source) return result;

  const lines = splitLines(source);
  let start = 0;
  const first = lines.find((line) => line.trim()) || "";
  if (hangulRatio(first) >= 0.25 && !looksLikeExpressionLine(first)) {
    const firstEn = lines.findIndex(
      (line) => line.trim() && hangulRatio(line) < 0.15 && /[A-Za-z]/.test(line) && !looksLikeExpressionLine(line)
    );
    if (firstEn > 0 && firstEn <= 8) start = firstEn;
  }

  const scriptLines = [];
  const koLines = [];
  const exprLines = [];
  let phase = "script";

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (phase === "script") scriptLines.push(line);
      else if (phase === "ko") koLines.push(line);
      else exprLines.push(line);
      continue;
    }

    const pair = looksLikeExpressionLine(trimmed);
    const korean = hangulRatio(trimmed) >= 0.25;

    if (phase === "script") {
      if (pair && scriptLines.some((row) => row.trim())) {
        phase = "expr";
        exprLines.push(line);
      } else if (korean) {
        phase = "ko";
        koLines.push(line);
      } else {
        scriptLines.push(line);
      }
    } else if (phase === "ko") {
      if (pair) {
        phase = "expr";
        exprLines.push(line);
      } else {
        koLines.push(line);
      }
    } else {
      exprLines.push(line);
    }
  }

  if (!result.script) {
    const script = scriptLines.join("\n").trim();
    if (script) result.script = script;
  }
  if (!result.literalTranslationKo) {
    const korean = koLines.join("\n").trim();
    if (korean) result.literalTranslationKo = korean;
  }
  if (!result.expressions.length) {
    const expressions = parseExpressions(exprLines.join("\n"));
    if (expressions.length) result.expressions = expressions;
  }

  if (result.script || result.literalTranslationKo || result.expressions.length) {
    if (result.mode === "none") result.mode = "photo";
  }
  return result;
}

function inferUnstructured(text, result) {
  if (result.script || result.expressions.length || result.listeningPoints.length || result.summaryKo || result.literalTranslationKo) {
    return result;
  }

  const lines = splitLines(text);
  const partIndex = lines.findIndex((line) => isPartOrSectionLine(line));
  if (partIndex >= 0) {
    result.script = lines.slice(partIndex).join("\n").trim();
    result.mode = "fallback";
    return result;
  }

  const arrowLines = lines.filter((line) => /→|->|=>|\|/.test(line));
  if (arrowLines.length >= 2) {
    result.listeningPoints = parseListeningPoints(arrowLines.join("\n"));
    result.mode = "fallback";
  }
  return result;
}

export function parseExpressions(text) {
  const serialized = parseSerializedPairList(text);
  if (serialized.length > 1) return serialized;
  const fallback = parsePairList(text, { meaningKey: "meaning", attachExamples: true });
  return fallback.length > serialized.length ? fallback : serialized;
}

export function parseListeningPoints(text) {
  return parsePairList(text, { meaningKey: "note" });
}

function unwrapExprLine(line) {
  let text = String(line || "").trim();
  text = text.replace(/^\s*[-*•∙·]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim();
  text = text.replace(/^\*\*(.+)\*\*$/s, "$1");
  text = text.replace(/^\*(.+)\*$/s, "$1");
  text = text.replace(/^_(.+)_$/s, "$1");
  return text.replace(/\*\*/g, "").trim();
}

function cleanMeaning(text) {
  return unwrapExprLine(text)
    .replace(/^(→|➜|➡|->|=>)\s*/, "")
    .trim();
}

function isBulletLine(line) {
  return /^\s*[-*•∙·]\s+\S/.test(line) || /^\s*\d+[.)]\s+\S/.test(line);
}

function isMeaningOnlyLine(line) {
  return /^(→|➜|➡|->|=>)\s*\S/.test(unwrapExprLine(line));
}

function looksLikeEnglishSentence(line) {
  const text = unwrapExprLine(line);
  if (!text || !/[A-Za-z]/.test(text)) return false;
  if (hangulRatio(text) >= 0.15) return false;
  if (/[|→➜➡]/.test(text)) return false;
  if (/~/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (/[.!?]$/.test(text) && words.length >= 3) return true;
  if (/^[A-Z]/.test(text) && words.length >= 6) return true;
  return false;
}

function extractInlinePair(line) {
  const text = unwrapExprLine(line);
  if (!text || parseLabeledExprField(text)) return null;

  const arrow = text.match(/^(.{1,120}?)\s*(→|➜|➡|->|=>)\s+(.+)$/);
  if (arrow && unwrapExprLine(arrow[1])) {
    return { phrase: unwrapExprLine(arrow[1]), meaning: cleanMeaning(arrow[3]) };
  }

  const pipe = splitOnce(text, "|");
  if (pipe && pipe[1]) {
    return { phrase: unwrapExprLine(pipe[0]), meaning: cleanMeaning(pipe[1]) };
  }

  const colon = text.match(/^([^:]{1,80})[:：]\s+(.+)$/);
  if (
    colon &&
    hasHangul(colon[2]) &&
    !/^part\s+\d+/i.test(colon[1]) &&
    !/^section\s+\d+/i.test(colon[1])
  ) {
    return { phrase: unwrapExprLine(colon[1]), meaning: cleanMeaning(colon[2]) };
  }

  const dash = text.match(/^(.{1,80}?)\s+[—–-]\s+(.+)$/);
  if (dash && hasHangul(dash[2])) {
    return { phrase: unwrapExprLine(dash[1]), meaning: cleanMeaning(dash[2]) };
  }

  return null;
}

function attachExample(item, example) {
  if (!item) return false;
  const text = unwrapExprLine(example);
  if (!text) return false;
  item.example = item.example ? `${item.example}\n${text}` : text;
  return true;
}

function repairExpressionItems(items) {
  const out = [];
  for (const item of items || []) {
    if (item?.manual) {
      const phrase = String(item.phrase || "").trim();
      if (!phrase) continue;
      out.push({
        ...item,
        phrase,
        meaning: String(item.meaning || "").trim(),
        example: String(item.example || "").trim(),
        favorite: Boolean(item.favorite),
        difficult: Boolean(item.difficult),
        manual: true,
      });
      continue;
    }
    const phrase = unwrapExprLine(item.phrase);
    const meaning = String(item.meaning || "");
    const nested = extractInlinePair(meaning);
    if (
      looksLikeEnglishSentence(phrase) &&
      nested &&
      /[A-Za-z]/.test(nested.phrase) &&
      hasHangul(nested.meaning)
    ) {
      attachExample(out[out.length - 1], phrase);
      out.push({
        ...makePair(nested.phrase, nested.meaning, "meaning", item.example || ""),
        id: item.id || uid(),
        favorite: Boolean(item.favorite),
        difficult: Boolean(item.difficult),
      });
      continue;
    }
    if (looksLikeEnglishSentence(phrase) && !cleanMeaning(meaning) && !item.example) {
      if (attachExample(out[out.length - 1], phrase)) continue;
    }
    if (isMeaningOnlyLine(phrase) && !cleanMeaning(meaning)) {
      const prev = out[out.length - 1];
      if (prev && !cleanMeaning(prev.meaning)) {
        prev.meaning = cleanMeaning(phrase);
        continue;
      }
    }
    out.push({
      ...item,
      phrase,
      meaning: cleanMeaning(meaning),
      example: unwrapExprLine(item.example || ""),
    });
  }
  return out.filter((item) => item.phrase);
}

export function normalizeExpressions(items) {
  // Keep each saved card as-is. 예문 등록 notes often include related
  // "phrase → meaning" bullets and must not be split into extra cards.
  return (items || [])
    .map((item) => {
      const phrase = String(item?.phrase || "").trim();
      if (!phrase) return null;
      return {
        ...item,
        phrase,
        meaning: String(item.meaning || "").trim(),
        example: String(item.example || "").trim(),
        exampleKo: String(item.exampleKo || "").trim(),
        favorite: Boolean(item.favorite),
        difficult: Boolean(item.difficult),
      };
    })
    .filter(Boolean);
}

export function parsePairList(text, options = {}) {
  const meaningKey = options.meaningKey || "meaning";
  const attachExamples = Boolean(options.attachExamples ?? meaningKey === "meaning");
  const rawLines = splitLines(text);
  const items = [];
  let current = null;

  const flush = () => {
    if (current?.phrase) items.push(current);
    current = null;
  };

  for (const raw of rawLines) {
    if (!String(raw || "").trim()) continue;
    const line = unwrapExprLine(raw);
    if (!line) continue;
    if (isPartOrSectionLine(line) || detectSectionHeader(line) || isExprCategoryLine(line)) continue;
    if (hangulRatio(line) >= 0.4 && !/[A-Za-z]/.test(line) && !isMeaningOnlyLine(line) && !parseLabeledExprField(line) && !current) continue;

    const labeled = attachExamples ? parseLabeledExprField(line) : null;
    if (labeled) {
      if (!current) continue;
      if (labeled.key === "example") {
        attachExample(current, labeled.value);
      } else if (labeled.key === "meaning") {
        current[meaningKey] = [current[meaningKey], labeled.value].filter(Boolean).join(" ");
      } else if (labeled.value) {
        current[meaningKey] = [current[meaningKey], labeled.value].filter(Boolean).join(" ");
      }
      continue;
    }

    if (attachExamples && isMeaningOnlyLine(line)) {
      if (current && !cleanMeaning(current[meaningKey])) {
        current[meaningKey] = cleanMeaning(line);
      } else if (current) {
        current[meaningKey] = [current[meaningKey], cleanMeaning(line)].filter(Boolean).join(" ");
      }
      continue;
    }

    const inline = extractInlinePair(line);
    if (inline?.phrase && inline.meaning) {
      flush();
      current = makePair(inline.phrase, inline.meaning, meaningKey);
      continue;
    }

    if (attachExamples && !isBulletLine(raw) && looksLikeEnglishSentence(line)) {
      if (current) {
        attachExample(current, line);
        continue;
      }
    }

    if (current && attachExamples && !cleanMeaning(current[meaningKey]) && hangulRatio(line) >= 0.25) {
      current[meaningKey] = cleanMeaning(line);
      continue;
    }

    if (line.length > 90 && !hasHangul(line) && looksLikeEnglishSentence(line) && !current) continue;

    flush();
    current = makePair(line, "", meaningKey);
  }
  flush();

  const ready = items.filter((item) => item.phrase);
  return attachExamples ? repairExpressionItems(ready) : ready;
}

function splitOnce(line, sep) {
  const index = line.indexOf(sep);
  if (index < 0) return null;
  const left = line.slice(0, index).trim();
  const right = line.slice(index + sep.length).trim();
  if (!left) return null;
  return [left, right];
}

function makePair(phrase, second, meaningKey, example = "") {
  const item = {
    id: uid(),
    phrase: unwrapExprLine(phrase),
    favorite: false,
    difficult: false,
    example: unwrapExprLine(example),
  };
  const value = meaningKey === "meaning" ? cleanMeaning(second) : String(second || "").trim();
  item[meaningKey] = value;
  if (meaningKey === "meaning") item.note = "";
  if (meaningKey === "note") item.meaning = "";
  return item;
}

export function parseAiResponse(raw) {
  const source = String(raw || "");
  const { buckets, marks } = collectBuckets(source);
  const tagged = marks.some((mark) => matchBracketTag(mark.header));

  const result = {
    mode: tagged ? "tags" : marks.length ? "natural" : "none",
    foundHeader: marks.length > 0,
    summaryKo: buckets.summaryKo.join("\n").trim(),
    script: buckets.script.join("\n").trim(),
    literalTranslationKo: buckets.literalTranslationKo.join("\n").trim(),
    expressions: parseExpressions(buckets.expressions.join("\n")),
    listeningPoints: parseListeningPoints(buckets.listeningPoints.join("\n")),
    memo: buckets.memo.join("\n").trim(),
    leftover: buckets.leftover.join("\n").trim(),
    sections: marks,
  };

  if (!marks.length) {
    inferThreeBlocks(source, result);
    if (result.script || result.literalTranslationKo || result.expressions.length) {
      return result;
    }
  }

  inferUnstructured(source, result);
  if (result.leftover && (!result.script || !result.literalTranslationKo || !result.expressions.length)) {
    inferThreeBlocks(result.leftover, result);
  }
  splitPackedScript(result);
  peelTrailingExpressions(result);
  return result;
}

function splitPackedScript(result) {
  if (!result.script || (result.literalTranslationKo && result.expressions.length)) return;
  const probe = {
    script: "",
    literalTranslationKo: "",
    expressions: [],
    mode: result.mode,
  };
  inferThreeBlocks(result.script, probe);
  if (!probe.literalTranslationKo && !probe.expressions.length) return;
  if (probe.script) result.script = probe.script;
  if (!result.literalTranslationKo && probe.literalTranslationKo) {
    result.literalTranslationKo = probe.literalTranslationKo;
  }
  if (!result.expressions.length && probe.expressions.length) {
    result.expressions = probe.expressions;
  }
}

function peelTrailingExpressions(result) {
  if (result.expressions.length || !result.literalTranslationKo) return;
  const lines = splitLines(result.literalTranslationKo);
  let start = lines.length;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (looksLikeExpressionLine(trimmed)) start = i;
    else break;
  }
  if (start >= lines.length) return;
  const items = parseExpressions(lines.slice(start).join("\n"));
  if (!items.length) return;
  result.expressions = items;
  result.literalTranslationKo = lines.slice(0, start).join("\n").trim();
}

export function parseAiOutput(raw) {
  return parseAiResponse(raw);
}

export function describeParseResult(parsed) {
  return [
    {
      ok: Boolean(parsed.summaryKo),
      label: "한국어 요약",
      detail: parsed.summaryKo ? "발견" : "없음",
    },
    {
      ok: Boolean(parsed.script),
      label: "Listening Script",
      detail: parsed.script ? "발견" : "없음",
    },
    {
      ok: Boolean(parsed.literalTranslationKo),
      label: "한글 직역",
      detail: parsed.literalTranslationKo ? "발견" : "없음",
    },
    {
      ok: parsed.expressions.length > 0,
      label: "Important Expression",
      detail: parsed.expressions.length ? `${parsed.expressions.length}개 발견` : "없음",
    },
    {
      ok: parsed.listeningPoints.length > 0,
      label: "Listening Points",
      detail: parsed.listeningPoints.length ? `${parsed.listeningPoints.length}개 발견` : "없음",
    },
    {
      ok: Boolean(parsed.memo),
      label: "메모",
      detail: parsed.memo ? "발견" : "없음",
    },
  ];
}

const SCRIPT_HEADING_RE =
  /^(?:#{1,3}\s*)?(?:\*\*)?\[?(part|section|scene)\s+(\d+)\s*[:.\-–—)]\s*(.*?)(?:\*\*)?\]?\s*$/gim;

export function parseScriptParts(script) {
  const text = String(script || "").trim();
  if (!text) return [];

  const partRe = new RegExp(SCRIPT_HEADING_RE.source, SCRIPT_HEADING_RE.flags);
  const matches = [...text.matchAll(partRe)];
  if (!matches.length) {
    return [{ id: uid(), number: 1, kind: "part", title: "", text }];
  }

  return matches
    .map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      return {
        id: uid(),
        number: Number(match[2]),
        kind: String(match[1] || "part").toLowerCase(),
        title: String(match[3] || "").replace(/\*\*/g, "").trim(),
        text: text.slice(start, end).trim(),
      };
    })
    .filter((part) => part.text || part.title);
}

export function scriptPartKindLabel(part) {
  const kind = part?.kind === "scene" ? "Scene" : part?.kind === "section" ? "Section" : "Part";
  return part?.number ? `${kind} ${part.number}` : kind;
}

const TRANSLATION_NOTE_RE = /^(?:\*+\s*)?(직역|의역(?:\s*\/\s*숨은 뜻)?|숨은 뜻)\s*[:：]\s*(.*)$/i;
const TRANSLATION_SPEAKER_RE =
  /^(?:\*+\s*)?([A-Za-z][A-Za-z0-9 .\/'-]{0,40}|[가-힣]{1,16}(?:\s+[가-힣]{1,16})?)\s*:\s+(.*)$/;

function parseDialogueLines(text) {
  const lines = [];
  let current = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "⸻") continue;
    const note = trimmed.match(TRANSLATION_NOTE_RE);
    if (note) {
      if (!current) {
        current = { speaker: "", en: "", literal: "", idiomatic: "" };
        lines.push(current);
      }
      const value = String(note[2] || "").trim();
      if (String(note[1] || "").startsWith("직역")) {
        current.literal = current.literal ? `${current.literal} ${value}` : value;
      } else {
        current.idiomatic = current.idiomatic ? `${current.idiomatic} ${value}` : value;
      }
      continue;
    }
    const spoken = trimmed.replace(/^\*+\s*/, "").match(TRANSLATION_SPEAKER_RE);
    if (spoken) {
      current = {
        speaker: spoken[1].trim(),
        en: spoken[2].trim(),
        literal: "",
        idiomatic: "",
      };
      lines.push(current);
      continue;
    }
    if (current && !current.literal && !current.idiomatic) {
      current.en = current.en ? `${current.en} ${trimmed}` : trimmed;
    } else {
      current = { speaker: "", en: trimmed, literal: "", idiomatic: "" };
      lines.push(current);
    }
  }
  return lines;
}

export function parseLiteralTranslation(text) {
  const parts = parseScriptParts(text);
  return parts.map((part) => {
    const lines = parseDialogueLines(part.text).filter(
      (line) => line.speaker || line.en || line.literal || line.idiomatic
    );
    const structured = lines.some((line) => line.literal || line.idiomatic || line.speaker);
    return {
      ...part,
      lines: structured ? lines : [],
      prose: structured ? "" : part.text,
    };
  });
}

export function scriptPartTitles(script) {
  return parseScriptParts(script)
    .map((part) => part.title)
    .filter(Boolean);
}

export const SCRIPT_TYPE_LINE = "Please type the text below exactly as it appears. ";

export function scriptForCopy(script) {
  const body = String(script || "").trim();
  if (!body) return "";
  return `${SCRIPT_TYPE_LINE}\n\n${body}`;
}

export function scriptPreviewLines(script, count = 3) {
  return String(script || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*[*_]{1,2}|\s*[*_]{1,2}\s*$/g, "").trim())
    .filter(Boolean)
    .slice(0, count);
}

function serializePairListLegacy(items, meaningKey = "meaning") {
  return (items || [])
    .map((item) => {
      const phrase = item.phrase || "";
      const second = item[meaningKey] || item.meaning || item.note || "";
      const example = meaningKey === "meaning" ? item.example || "" : "";
      const head = second ? `${phrase} | ${second}` : phrase;
      return example ? `${head}\n${example}` : head;
    })
    .join("\n\n");
}

export function serializePairList(items, meaningKey = "meaning") {
  return (items || [])
    .map((item) => {
      const phrase = item.phrase || "";
      const second = item[meaningKey] || item.meaning || item.note || "";
      const example = meaningKey === "meaning" ? item.example || "" : "";
      const head = second ? `${phrase} | ${second}` : phrase;
      if (!example || meaningKey !== "meaning") return head;
      const exampleLines = String(example)
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => `예문: ${line}`);
      return [head, ...exampleLines].join("\n");
    })
    .join("\n\n");
}

export function samePairListText(text, items, meaningKey = "meaning") {
  const norm = normalizePairText(text);
  return (
    norm === normalizePairText(serializePairList(items, meaningKey)) ||
    norm === normalizePairText(serializePairListLegacy(items, meaningKey))
  );
}

export function parseSerializedPairList(text, meaningKey = "meaning") {
  const items = [];
  let current = null;
  const flush = () => {
    if (current?.phrase) {
      delete current._exampleStarted;
      items.push(current);
    }
    current = null;
  };

  for (const raw of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const exampleLine = parseExactExampleLine(raw);
    if (exampleLine !== null) {
      if (current) appendExampleLine(current, exampleLine);
      continue;
    }
    if (!String(raw || "").trim()) continue;

    const line = unwrapExprLine(raw);
    if (!line) continue;
    const inline = extractInlinePair(line);
    if (inline?.phrase && inline.meaning) {
      flush();
      current = makePair(inline.phrase, inline.meaning, meaningKey);
      continue;
    }

    if (current && meaningKey === "meaning") {
      const hasMeaning = Boolean(cleanMeaning(current.meaning));
      const hasExample = Boolean(current._exampleStarted || current.example);
      if (!hasExample && hangulRatio(line) >= 0.25) {
        current.meaning = hasMeaning
          ? [current.meaning, cleanMeaning(line)].filter(Boolean).join(" ")
          : cleanMeaning(line);
        continue;
      }
      if (hasMeaning && !hasExample && /[A-Za-z]/.test(line) && hangulRatio(line) < 0.4) {
        appendExampleLine(current, line);
        continue;
      }
    }

    flush();
    current = makePair(line, "", meaningKey);
  }
  flush();
  return items;
}

function parseExactExampleLine(line) {
  const match = String(line || "").match(/^(예문|example)\s*[:：] ?(.*)$/i);
  return match ? match[2] : null;
}

function appendExampleLine(item, line) {
  if (!item) return;
  if (!item._exampleStarted) {
    item.example = line;
    item._exampleStarted = true;
    return;
  }
  item.example = `${item.example}\n${line}`;
}

function normalizePairText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function createEmptyLessonFields() {
  return {
    summaryKo: "",
    script: "",
    literalTranslationKo: "",
    expressions: [],
    listeningPoints: [],
    memo: "",
  };
}

export const AI_PROMPT_TEMPLATE = `아래 책 페이지 사진을 보고 개인 영어 학습용으로 정리해 주세요.

중요한 규칙:
- 원문을 그대로 복사하지 마세요.
- 해당 페이지의 의미와 어휘·문장 구조를 참고하여 새롭게 재구성한 Listening Script를 만들어 주세요.
- 아래 세 영역의 제목을 그대로 지켜 주세요. 다른 설명은 넣지 마세요.

Listening Script
Part 1: 소제목
재구성한 영어 스크립트

Part 2: 소제목
재구성한 영어 스크립트

한글 직역
위 Listening Script를 문장 순서대로 직역한 한국어

Important Expression
영어 표현
→ 한국어 뜻
예문 한 문장`
