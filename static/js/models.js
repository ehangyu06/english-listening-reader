import { uid } from "./utils.js?v=20260816p";
import { parsePairList, parseSerializedPairList, samePairListText } from "./services/parser.js?v=20260825b";
import { MAX_PAGE_PHOTOS } from "./storage/lessons.js?v=20260825c";
import { remapHighlights } from "./ui/penHighlight.js?v=20260823o";

export function createLesson({
  existing = null,
  bookTitle,
  chapter,
  page,
  studiedAt,
  summaryKo,
  script,
  literalTranslationKo,
  expressionsText,
  listeningPointsText,
  memo,
  imageId = "",
  imageIds,
}) {
  const now = new Date().toISOString();
  const savedImageIds = [];
  const seenImages = new Set();
  const imageSource = Array.isArray(imageIds)
    ? imageIds
    : [imageId, existing?.imageId, ...(existing?.imageIds || [])];
  for (const raw of imageSource) {
    const id = String(raw || "").trim();
    if (!id || seenImages.has(id)) continue;
    seenImages.add(id);
    savedImageIds.push(id);
    if (savedImageIds.length >= MAX_PAGE_PHOTOS) break;
  }
  const expressions = existing && samePairListText(expressionsText, existing.expressions)
    ? existing.expressions
    : mergePairs(
        existing?.expressions,
        parseSerializedPairList(expressionsText),
        now
      );
  const listeningPoints = existing && samePairListText(listeningPointsText, existing.listeningPoints, "note")
    ? existing.listeningPoints
    : mergePairs(
        existing?.listeningPoints,
        parsePairList(listeningPointsText, { meaningKey: "note" }),
        now
      );

  return {
    id: existing?.id || uid(),
    bookTitle: bookTitle.trim(),
    chapter: chapter.trim(),
    page: String(page).trim(),
    studiedAt: studiedAt || now.slice(0, 10),
    imageId: savedImageIds[0] || "",
    imageIds: savedImageIds,
    summaryKo: summaryKo.trim(),
    script: script.trim(),
    literalTranslationKo: String(
      literalTranslationKo ?? existing?.literalTranslationKo ?? ""
    ).trim(),
    pageInterpretationKo: String(existing?.pageInterpretationKo ?? "").trim(),
    expressions,
    listeningPoints,
    memo: memo.trim(),
    completed: existing?.completed || false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastStudiedAt: existing?.lastStudiedAt || now,
    studyCount: existing?.studyCount || 0,
    needsReview: existing?.needsReview || false,
    audioTracks: existing?.audioTracks || [],
  };
}

function mergePairs(oldItems, newItems, now) {
  const stamp = now || new Date().toISOString();
  return (newItems || []).map((item) => {
    const prev = (oldItems || []).find((old) => old.phrase === item.phrase);
    if (!prev) {
      return {
        ...item,
        createdAt: item.createdAt || stamp,
        updatedAt: stamp,
        manual: true,
      };
    }
    const nextExample = item.example ?? prev.example ?? "";
    const nextExampleKo = item.exampleKo ?? prev.exampleKo ?? "";
    const exampleChanged = String(nextExample) !== String(prev.example || "");
    const exampleKoChanged = String(nextExampleKo) !== String(prev.exampleKo || "");
    return {
      ...prev,
      ...item,
      id: prev.id,
      favorite: prev.favorite,
      difficult: prev.difficult,
      createdAt: prev.createdAt || item.createdAt || stamp,
      updatedAt: stamp,
      example: nextExample,
      exampleKo: nextExampleKo,
      exampleHighlights: exampleChanged
        ? remapHighlights(prev.example, nextExample, prev.exampleHighlights)
        : prev.exampleHighlights || [],
      exampleKoHighlights: exampleKoChanged
        ? remapHighlights(prev.exampleKo, nextExampleKo, prev.exampleKoHighlights)
        : prev.exampleKoHighlights || [],
      manual: true,
    };
  });
}
