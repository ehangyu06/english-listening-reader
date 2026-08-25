// 직장/집 공용 클라우드. anon 키는 브라우저용 공개 키입니다.
// service_role 키는 절대 넣지 마세요.
//
// 1) 영어 회화용 Supabase 프로젝트(또는 새 프로젝트) SQL Editor에
//    supabase/setup.sql 전체를 붙여넣고 Run
// 2) Project Settings → API 에서 Project URL 과 anon public 키를
//    홈 화면의 클라우드 연결 칸에 붙여넣거나, 아래에 직접 넣기
// 3) 집 맥에서 이 앱을 한 번 열면 기존 학습자료가 클라우드로 올라갑니다
export const CLOUD = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};

export const CLOUD_STORAGE_KEY = "listening-cloud";

export const BUCKET = "listening-media";
export const LESSON_TABLE = "listening_lessons";
export const SETTING_TABLE = "listening_settings";
export const FILE_TABLE = "listening_files";

function readSavedCloud() {
  try {
    const raw = localStorage.getItem(CLOUD_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved?.supabaseUrl && saved?.supabaseAnonKey) return saved;
  } catch {
    /* ignore */
  }
  return null;
}

export function getCloudConfig() {
  const injected = typeof window !== "undefined" ? window.__LISTENING_CLOUD__ : null;
  if (injected?.supabaseUrl && injected?.supabaseAnonKey) return injected;
  const saved = readSavedCloud();
  if (saved) return saved;
  return CLOUD;
}

export function saveCloudConfig({ supabaseUrl, supabaseAnonKey }) {
  const next = {
    supabaseUrl: String(supabaseUrl || "").trim().replace(/\/$/, ""),
    supabaseAnonKey: String(supabaseAnonKey || "").trim(),
  };
  localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearCloudConfig() {
  localStorage.removeItem(CLOUD_STORAGE_KEY);
}
