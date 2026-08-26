// 직장/집 공용 클라우드. anon 키는 브라우저용 공개 키입니다.
// service_role 키는 절대 넣지 마세요.
//
// 1) 영어 회화용 Supabase 프로젝트(또는 새 프로젝트) SQL Editor에
//    supabase/setup.sql 전체를 붙여넣고 Run
// 2) Project Settings → API 에서 Project URL 과 anon public 키를
//    홈 화면의 클라우드 연결 칸에 붙여넣거나, 아래에 직접 넣기
// 3) 집 맥에서 이 앱을 한 번 열면 기존 학습자료가 클라우드로 올라갑니다
export const CLOUD = {
  supabaseUrl: "https://fecabexqgxcgiwqqwamx.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlY2FiZXhxZ3hjZ2l3cXF3YW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDE1NzMsImV4cCI6MjA5ODM3NzU3M30.JhFLNxaohz-GT-oBrchRF6eyrNbmhSP0lnMMpDR7Rvc",
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

function readHashCloud() {
  if (typeof window === "undefined") return null;
  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (!hash.startsWith("c=")) return null;
  try {
    const json = JSON.parse(atob(decodeURIComponent(hash.slice(2))));
    if (json?.supabaseUrl && json?.supabaseAnonKey) {
      saveCloudConfig(json);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return json;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function hasCloud(value) {
  return Boolean(String(value?.supabaseUrl || "").trim() && String(value?.supabaseAnonKey || "").trim());
}

export function getCloudConfig() {
  const fromHash = readHashCloud();
  if (fromHash) return fromHash;
  const injected = typeof window !== "undefined" ? window.__LISTENING_CLOUD__ : null;
  if (hasCloud(injected)) {
    saveCloudConfig(injected);
    return injected;
  }
  const saved = readSavedCloud();
  if (saved) return saved;
  if (hasCloud(CLOUD) && typeof window !== "undefined") {
    saveCloudConfig(CLOUD);
  }
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
