// لایه‌ی ذخیره‌سازی محلی روی IndexedDB.
// بقیه‌ی کد فقط از این توابع استفاده می‌کند تا بعداً بشود پشتش چیز دیگری گذاشت.

import { DB_NAME, DB_VERSION, STORES } from "./config.js";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // نسخه‌ی ۱: فقط اضافه‌کردن. تغییرات بعدی هم فقط store یا index جدید اضافه کنند.
      if (!db.objectStoreNames.contains(STORES.captures)) {
        const s = db.createObjectStore(STORES.captures, { keyPath: "id" });
        s.createIndex("capturedAt", "capturedAt");
        s.createIndex("groupName", "groupName");
        s.createIndex("url", "url");
        s.createIndex("syncStatus", "syncStatus");
      }
      if (!db.objectStoreNames.contains(STORES.bodies)) {
        db.createObjectStore(STORES.bodies, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ثبت کامل را به دو بخش سبک و سنگین تقسیم و ذخیره می‌کند.
export async function saveCapture(capture) {
  const { html, visibleText, ...meta } = capture;
  const db = await openDb();
  const tx = db.transaction([STORES.captures, STORES.bodies], "readwrite");
  tx.objectStore(STORES.captures).put(meta);
  tx.objectStore(STORES.bodies).put({ id: capture.id, html, visibleText });
  await done(tx);
  return meta;
}

// فقط متادیتا، جدیدترین اول.
export async function listCaptures() {
  const db = await openDb();
  const tx = db.transaction(STORES.captures, "readonly");
  const all = await result(tx.objectStore(STORES.captures).getAll());
  return all.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
}

export async function getFullCapture(id) {
  const db = await openDb();
  const tx = db.transaction([STORES.captures, STORES.bodies], "readonly");
  const [meta, body] = await Promise.all([
    result(tx.objectStore(STORES.captures).get(id)),
    result(tx.objectStore(STORES.bodies).get(id)),
  ]);
  if (!meta) return null;
  return { ...meta, html: body?.html ?? "", visibleText: body?.visibleText ?? "" };
}

export async function deleteCapture(id) {
  const db = await openDb();
  const tx = db.transaction([STORES.captures, STORES.bodies], "readwrite");
  tx.objectStore(STORES.captures).delete(id);
  tx.objectStore(STORES.bodies).delete(id);
  await done(tx);
}

// بعداً برای وضعیت ارسال به سرور استفاده می‌شود.
export async function updateCaptureMeta(id, patch) {
  const db = await openDb();
  const tx = db.transaction(STORES.captures, "readwrite");
  const store = tx.objectStore(STORES.captures);
  const meta = await result(store.get(id));
  if (meta) store.put({ ...meta, ...patch });
  await done(tx);
}
