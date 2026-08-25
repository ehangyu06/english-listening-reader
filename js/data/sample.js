import { uid } from "../utils.js?v=20260816p";
import { getSetting, setSetting } from "../storage/db.js?v=20260825c";

export const SAMPLE_ID = "sample-willow-lane-ch1-p1";

export function buildSampleLesson() {
  const now = new Date().toISOString();
  return {
    id: SAMPLE_ID,
    bookTitle: "Willow Lane",
    chapter: "Chapter 1",
    page: "1",
    studiedAt: now.slice(0, 10),
    imageId: "",
    summaryKo:
      "작은 마을 윌로 레인의 빵집에서 아침이 시작된다. 제빵사 엘라는 해가 뜨기 전에 반죽을 치대고, 아직 조용한 거리를 바라본다. 종소리가 울릴 무렵 갓 구운 빵이 진열대에 오르고, 빨간 목도리를 한 아이가 창에 얼굴을 붙인다. 엘라는 서두르지 않은 채 문을 지켜보다가, 손님이 들어오면 미소로 맞이한다.",
    script: `Part 1: Before Sunrise

Ella kneaded the dough with slow, steady hands. The kitchen was quiet except for the soft tick of the clock on the wall. She took pride in this early hour, when the street outside still belonged to the birds.

Part 2: The First Customers

By the time the morning bell rang across Willow Lane, warm bread sat in neat rows on the wooden counter. A boy with a red scarf pressed his face to the window. Ella had no patience for rushing, but she kept an eye on the door and smiled as it opened.`,
    expressions: [
      {
        id: uid(),
        phrase: "take pride in",
        meaning: "~을 자랑스럽게 여기다",
        note: "",
        favorite: false,
        difficult: false,
      },
      {
        id: uid(),
        phrase: "have no patience for",
        meaning: "~을 참지 못하다 / ~에 인내심이 없다",
        note: "",
        favorite: false,
        difficult: false,
      },
      {
        id: uid(),
        phrase: "keep an eye on",
        meaning: "~을 지켜보다",
        note: "",
        favorite: false,
        difficult: false,
      },
      {
        id: uid(),
        phrase: "by the time",
        meaning: "~할 때쯤이면",
        note: "",
        favorite: false,
        difficult: false,
      },
    ],
    listeningPoints: [
      {
        id: uid(),
        phrase: "kneaded the dough",
        meaning: "",
        note: "kneaded의 -ed가 약하게 들릴 수 있음",
        favorite: false,
        difficult: false,
      },
      {
        id: uid(),
        phrase: "belonged to the birds",
        meaning: "",
        note: "belonged to가 연결되어 하나의 덩어리처럼 들릴 수 있음",
        favorite: false,
        difficult: false,
      },
      {
        id: uid(),
        phrase: "by the time",
        meaning: "",
        note: "by + the가 빠르게 이어져 bythe처럼 들릴 수 있음",
        favorite: false,
        difficult: false,
      },
      {
        id: uid(),
        phrase: "pressed his face",
        meaning: "",
        note: "pressed his에서 his가 약하게 들릴 수 있음",
        favorite: false,
        difficult: false,
      },
    ],
    memo: "샘플 수업입니다. 저작권이 있는 책 원문이 아니라, 앱 동작을 확인하려고 새로 쓴 짧은 예문입니다.",
    completed: false,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: now,
    studyCount: 0,
    needsReview: false,
    audioTracks: [],
  };
}

export async function ensureSampleLesson() {
  return;
}

export async function removeSampleLesson() {
  const { getLesson, deleteLesson } = await import("../storage/lessons.js?v=20260825c");
  const { remoteDeleteLesson } = await import("../storage/remote.js?v=20260825c");
  try {
    const existing = await getLesson(SAMPLE_ID);
    if (existing) await deleteLesson(SAMPLE_ID);
    else await remoteDeleteLesson(SAMPLE_ID);
  } catch (error) {
    console.warn(error);
  }
  const current = await getSetting("currentBook", "");
  if (current === "Willow Lane") {
    await setSetting("currentBook", "");
  }
}
