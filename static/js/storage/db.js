const DB_NAME = "english-listening-reader";
const DB_VERSION = 2;

let dbPromise = null;

export function hasStore(db, name) {
  return Boolean(db?.objectStoreNames?.contains(name));
}

export function initDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      finish(reject, error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("lessons")) {
        const lessons = db.createObjectStore("lessons", { keyPath: "id" });
        lessons.createIndex("bookTitle", "bookTitle", { unique: false });
        lessons.createIndex("updatedAt", "updatedAt", { unique: false });
        lessons.createIndex("studiedAt", "studiedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("audio")) {
        db.createObjectStore("audio", { keyPath: "id" });
      }
    };

    request.onblocked = () => {
      console.warn("IndexedDB upgrade is waiting for other tabs to close.");
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      finish(resolve, db);
    };
    request.onerror = () => finish(reject, request.error || new Error("IndexedDB를 열 수 없습니다."));
  });

  return dbPromise;
}

export async function runStore(storeName, mode, fn) {
  const db = await initDb();
  if (!hasStore(db, storeName)) {
    throw new Error(`저장소가 없습니다: ${storeName}`);
  }
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      reject(error);
      return;
    }
    const store = tx.objectStore(storeName);
    let request;
    try {
      request = fn(store);
    } catch (error) {
      reject(error);
      return;
    }
    let value;

    if (request && typeof request === "object" && "onsuccess" in request) {
      request.onsuccess = () => {
        value = request.result;
      };
      request.onerror = () => reject(request.error);
    } else {
      value = request;
    }

    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB aborted"));
  });
}

export async function getSetting(key, fallback = null) {
  const row = await runStore("settings", "readonly", (store) => store.get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await runStore("settings", "readwrite", (store) => store.put({ key, value }));
  try {
    const { remotePutSetting } = await import("./remote.js?v=20260825c");
    await remotePutSetting(key, value);
  } catch (error) {
    console.warn(error);
  }
}
