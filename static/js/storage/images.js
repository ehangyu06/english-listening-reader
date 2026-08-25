import { runStore } from "./db.js?v=20260825c";
import { remoteDeleteBlob, remoteGetBlob, remotePutBlob } from "./remote.js?v=20260825c";

export async function saveImage(record) {
  await runStore("images", "readwrite", (store) => store.put(record));
  try {
    await remotePutBlob("images", record);
  } catch (error) {
    console.warn(error);
  }
  return record.id;
}

export async function getImage(id) {
  if (!id) return null;
  const local = await runStore("images", "readonly", (store) => store.get(id));
  if (local) return local;
  try {
    const remote = await remoteGetBlob("images", id);
    if (remote) {
      await runStore("images", "readwrite", (store) => store.put(remote));
      return remote;
    }
  } catch (error) {
    console.warn(error);
  }
  return null;
}

export async function deleteImage(id) {
  if (!id) return;
  await runStore("images", "readwrite", (store) => store.delete(id));
  try {
    await remoteDeleteBlob("images", id);
  } catch (error) {
    console.warn(error);
  }
}

export async function compressImageFile(file, maxSize = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
    });
    return blob || file;
  } catch {
    return file;
  }
}
