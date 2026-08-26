import {
  BUCKET,
  FILE_TABLE,
  LESSON_TABLE,
  SETTING_TABLE,
  getCloudConfig,
} from "../config.js?v=20260827i";

export function isCloudEnabled() {
  const cloud = getCloudConfig();
  return Boolean(String(cloud.supabaseUrl || "").trim() && String(cloud.supabaseAnonKey || "").trim());
}

function rootUrl() {
  return String(getCloudConfig().supabaseUrl || "").replace(/\/$/, "");
}

function authHeaders(extra = {}) {
  const key = getCloudConfig().supabaseAnonKey;
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    ...extra,
  };
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rest(method, table, { query = "", body, prefer } = {}) {
  const url = rootUrl() + "/rest/v1/" + table + (query ? "?" + query : "");
  const headers = authHeaders({
    "Content-Type": "application/json",
  });
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payload = await parseBody(res);
  if (!res.ok) {
    const message = typeof payload === "string" ? payload : JSON.stringify(payload || {});
    const error = new Error("cloud " + res.status + " " + String(message).slice(0, 240));
    error.status = res.status;
    throw error;
  }
  return payload;
}

function objectPath(kind, id) {
  return kind + "/" + encodeURIComponent(id);
}

export async function cloudPing() {
  if (!isCloudEnabled()) return false;
  try {
    await rest("GET", LESSON_TABLE, { query: "select=id&limit=1" });
    return true;
  } catch {
    return false;
  }
}

export async function cloudGetState() {
  if (!isCloudEnabled()) return null;
  const [lessonRows, settingRows, fileRows] = await Promise.all([
    rest("GET", LESSON_TABLE, { query: "select=id,data,updated_at" }),
    rest("GET", SETTING_TABLE, { query: "select=key,value,updated_at" }),
    rest("GET", FILE_TABLE, { query: "select=kind,id,mime_type,file_name" }),
  ]);
  const lessons = [];
  for (const row of lessonRows || []) {
    const lesson = row?.data && typeof row.data === "object" ? { ...row.data } : {};
    if (!lesson.id) lesson.id = row.id;
    if (row.updated_at && (!lesson.updatedAt || String(row.updated_at) > String(lesson.updatedAt))) {
      lesson.updatedAt = row.updated_at;
    }
    lessons.push(lesson);
  }
  const settings = {};
  for (const row of settingRows || []) {
    if (row?.key) settings[row.key] = row.value;
  }
  const files = { images: {}, audio: {} };
  for (const row of fileRows || []) {
    if (row?.kind !== "images" && row?.kind !== "audio") continue;
    if (!row.id) continue;
    files[row.kind][row.id] = {
      mimeType: row.mime_type || "application/octet-stream",
      fileName: row.file_name || "",
    };
  }
  return { lessons, settings, files };
}

export async function cloudPutLesson(lesson) {
  if (!isCloudEnabled() || !lesson?.id) return;
  await rest("POST", LESSON_TABLE, {
    body: {
      id: lesson.id,
      data: lesson,
      updated_at: lesson.updatedAt || new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export async function cloudDeleteLesson(id) {
  if (!isCloudEnabled() || !id) return;
  await rest("DELETE", LESSON_TABLE, { query: "id=eq." + encodeURIComponent(id) });
}

export async function cloudPutSetting(key, value) {
  if (!isCloudEnabled() || !key) return;
  await rest("POST", SETTING_TABLE, {
    body: {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export async function cloudBlobExists(kind, id) {
  if (!isCloudEnabled() || !id) return false;
  try {
    const rows = await rest("GET", FILE_TABLE, {
      query:
        "select=id&kind=eq." +
        encodeURIComponent(kind) +
        "&id=eq." +
        encodeURIComponent(id) +
        "&limit=1",
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function cloudGetBlob(kind, id) {
  if (!isCloudEnabled() || !id) return null;
  const res = await fetch(rootUrl() + "/storage/v1/object/" + BUCKET + "/" + objectPath(kind, id), {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const error = new Error("cloud blob " + res.status);
    error.status = res.status;
    throw error;
  }
  const blob = await res.blob();
  let meta = {};
  try {
    const rows = await rest("GET", FILE_TABLE, {
      query:
        "select=mime_type,file_name&kind=eq." +
        encodeURIComponent(kind) +
        "&id=eq." +
        encodeURIComponent(id) +
        "&limit=1",
    });
    meta = rows?.[0] || {};
  } catch {
    meta = {};
  }
  return {
    id,
    blob,
    mimeType: meta.mime_type || blob.type || "application/octet-stream",
    fileName: meta.file_name || "",
  };
}

export async function cloudPutBlob(kind, record) {
  if (!isCloudEnabled() || !record?.id || !record.blob) return;
  const mimeType = record.mimeType || record.blob.type || "application/octet-stream";
  const fileName = record.fileName || "";
  const res = await fetch(rootUrl() + "/storage/v1/object/" + BUCKET + "/" + objectPath(kind, record.id), {
    method: "POST",
    cache: "no-store",
    headers: authHeaders({
      "Content-Type": mimeType,
      "x-upsert": "true",
    }),
    body: record.blob,
  });
  if (!res.ok) {
    const text = await res.text();
    const error = new Error("cloud upload " + res.status + " " + String(text).slice(0, 240));
    error.status = res.status;
    throw error;
  }
  await rest("POST", FILE_TABLE, {
    body: {
      kind,
      id: record.id,
      mime_type: mimeType,
      file_name: fileName,
      updated_at: new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export async function cloudDeleteBlob(kind, id) {
  if (!isCloudEnabled() || !id) return;
  try {
    await fetch(rootUrl() + "/storage/v1/object/" + BUCKET + "/" + objectPath(kind, id), {
      method: "DELETE",
      cache: "no-store",
      headers: authHeaders(),
    });
  } catch (error) {
    console.warn(error);
  }
  try {
    await rest("DELETE", FILE_TABLE, {
      query: "kind=eq." + encodeURIComponent(kind) + "&id=eq." + encodeURIComponent(id),
    });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}
