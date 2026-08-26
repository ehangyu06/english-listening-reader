import { getCloudConfig } from "../config.js?v=20260827i";
import {
  cloudBlobExists,
  cloudDeleteBlob,
  cloudDeleteLesson,
  cloudGetBlob,
  cloudGetState,
  cloudPing,
  cloudPutBlob,
  cloudPutLesson,
  cloudPutSetting,
  isCloudEnabled,
} from "./cloud.js?v=20260827i";

export function useMacRemote() {
  const host = location.hostname || "";
  if (host === "127.0.0.1" || host === "localhost") return true;
  if (host.endsWith(".local")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

async function macRequest(url, options = {}) {
  const res = await fetch(url, { cache: "no-store", ...options });
  if (!res.ok) {
    const error = new Error("remote " + res.status);
    error.status = res.status;
    throw error;
  }
  return res;
}

async function quiet(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(label, error);
    return null;
  }
}

function newer(a, b) {
  return String(a?.updatedAt || "") >= String(b?.updatedAt || "");
}

function mergeStates(mac, cloud) {
  const lessons = new Map();
  for (const source of [mac, cloud]) {
    for (const lesson of source?.lessons || []) {
      if (!lesson?.id) continue;
      const current = lessons.get(lesson.id);
      if (!current || newer(lesson, current)) lessons.set(lesson.id, lesson);
    }
  }
  const settings = { ...(mac?.settings || {}), ...(cloud?.settings || {}) };
  const files = { images: {}, audio: {} };
  for (const source of [mac, cloud]) {
    for (const kind of ["images", "audio"]) {
      Object.assign(files[kind], source?.files?.[kind] || {});
    }
  }
  return {
    lessons: [...lessons.values()],
    settings,
    files,
  };
}

async function macGetState() {
  if (!useMacRemote()) return null;
  const res = await macRequest("/api/state");
  return res.json();
}

export async function remoteStatus() {
  const mac = useMacRemote()
    ? await quiet("mac status", async () => {
        const res = await macRequest("/api/state");
        return Boolean(res.ok);
      })
    : false;
  const cloud = isCloudEnabled() ? await cloudPing() : false;
  return {
    mac: Boolean(mac),
    cloud: Boolean(cloud),
    cloudConfigured: isCloudEnabled(),
  };
}

export async function remoteGetState() {
  const mac = await quiet("mac state", macGetState);
  const cloud = isCloudEnabled() ? await quiet("cloud state", cloudGetState) : null;
  if (!mac && !cloud) {
    const error = new Error("remote unavailable");
    error.status = 0;
    throw error;
  }
  return mergeStates(mac, cloud);
}

export async function remotePutLesson(lesson) {
  const tasks = [];
  if (useMacRemote()) {
    tasks.push(
      macRequest("/api/lessons/" + encodeURIComponent(lesson.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lesson),
      })
    );
  }
  if (isCloudEnabled()) tasks.push(cloudPutLesson(lesson));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn(result.reason);
  }
}

export async function remoteDeleteLesson(id) {
  const tasks = [];
  if (useMacRemote()) {
    tasks.push(macRequest("/api/lessons/" + encodeURIComponent(id), { method: "DELETE" }));
  }
  if (isCloudEnabled()) tasks.push(cloudDeleteLesson(id));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn(result.reason);
  }
}

export async function remotePutSetting(key, value) {
  const tasks = [];
  if (useMacRemote()) {
    tasks.push(
      macRequest("/api/settings/" + encodeURIComponent(key), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      })
    );
  }
  if (isCloudEnabled()) tasks.push(cloudPutSetting(key, value));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn(result.reason);
  }
}

async function macBlobExists(kind, id) {
  if (!id || !useMacRemote()) return false;
  try {
    const res = await macRequest("/api/" + kind + "/" + encodeURIComponent(id) + "/exists");
    const data = await res.json();
    return Boolean(data.exists);
  } catch {
    return false;
  }
}

export async function remoteBlobExists(kind, id) {
  if (!id) return false;
  if (await macBlobExists(kind, id)) return true;
  if (isCloudEnabled()) return cloudBlobExists(kind, id);
  return false;
}

export async function persistCloudToMac() {
  if (!useMacRemote() || !isCloudEnabled()) return null;
  const cloud = getCloudConfig();
  const res = await macRequest("/api/cloud-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supabaseUrl: cloud.supabaseUrl,
      supabaseAnonKey: cloud.supabaseAnonKey,
    }),
  });
  return res.json();
}

export async function macCloudPushStatus() {
  if (!useMacRemote()) return null;
  try {
    const res = await macRequest("/api/cloud-push");
    return res.json();
  } catch {
    return null;
  }
}

export async function ensureRemoteBlob(kind, record) {
  if (!record?.id || !record.blob) return;
  const tasks = [];
  if (useMacRemote() && !(await macBlobExists(kind, record.id))) {
    tasks.push(
      macRequest("/api/" + kind + "/" + encodeURIComponent(record.id), {
        method: "PUT",
        headers: {
          "Content-Type": record.mimeType || record.blob.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(record.fileName || ""),
        },
        body: record.blob,
      })
    );
  }
  if (isCloudEnabled() && !(await cloudBlobExists(kind, record.id))) {
    tasks.push(cloudPutBlob(kind, record));
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn(result.reason);
  }
}

export async function remoteGetBlob(kind, id) {
  if (!id) return null;
  if (useMacRemote()) {
    try {
      const res = await macRequest("/api/" + kind + "/" + encodeURIComponent(id));
      const blob = await res.blob();
      return {
        id,
        blob,
        mimeType: res.headers.get("Content-Type") || blob.type || "application/octet-stream",
        fileName: decodeURIComponent(res.headers.get("X-File-Name") || ""),
      };
    } catch (error) {
      if (error.status && error.status !== 404) console.warn(error);
    }
  }
  if (isCloudEnabled()) return cloudGetBlob(kind, id);
  return null;
}

export async function remotePutBlob(kind, record) {
  if (!record?.id || !record.blob) return;
  const tasks = [];
  if (useMacRemote()) {
    tasks.push(
      macRequest("/api/" + kind + "/" + encodeURIComponent(record.id), {
        method: "PUT",
        headers: {
          "Content-Type": record.mimeType || record.blob.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(record.fileName || ""),
        },
        body: record.blob,
      })
    );
  }
  if (isCloudEnabled()) tasks.push(cloudPutBlob(kind, record));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn(result.reason);
  }
}

export async function remoteDeleteBlob(kind, id) {
  if (!id) return;
  const tasks = [];
  if (useMacRemote()) {
    tasks.push(
      macRequest("/api/" + kind + "/" + encodeURIComponent(id), { method: "DELETE" }).catch((error) => {
        if (error.status !== 404) throw error;
      })
    );
  }
  if (isCloudEnabled()) tasks.push(cloudDeleteBlob(kind, id));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected" && result.reason?.status !== 404) console.warn(result.reason);
  }
}
