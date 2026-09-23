// Service worker: تنها جایی که به IndexedDB اکستنشن دسترسی دارد
// (content script اگر خودش IndexedDB باز کند، در دیتابیس سایت علی‌بابا می‌نویسد).

import { MSG, PREF_KEYS, CAPTURE_SCHEMA_VERSION } from "../shared/config.js";
import { saveCapture } from "../shared/db.js";
import { sendCapture } from "../shared/transport.js";

const LIST_PAGE = "src/pages/list.html";

chrome.action.onClicked.addListener(() => openListPage());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // پاسخ async
});

const handlers = {
  async [MSG.SAVE_CAPTURE](msg, sender) {
    // فقط از content script خود اکستنشن روی یک تب واقعی پذیرفته می‌شود.
    if (sender.id !== chrome.runtime.id || !sender.tab) throw new Error("invalid sender");
    const capture = buildRecord(msg.payload);
    const meta = await saveCapture(capture);
    await chrome.storage.local.set({ [PREF_KEYS.lastGroupName]: capture.groupName });
    // در نسخه‌ی صفر کاری نمی‌کند (خاموش).
    await sendCapture(capture);
    return { id: meta.id };
  },

  async [MSG.GET_LAST_GROUP]() {
    const prefs = await chrome.storage.local.get(PREF_KEYS.lastGroupName);
    return prefs[PREF_KEYS.lastGroupName] || "";
  },

  async [MSG.OPEN_LIST]() {
    await openListPage();
  },
};

function buildRecord(p) {
  if (!p || typeof p.url !== "string" || typeof p.html !== "string") {
    throw new Error("invalid capture payload");
  }
  const html = p.html;
  const visibleText = typeof p.visibleText === "string" ? p.visibleText : "";
  const images = Array.isArray(p.images) ? p.images : [];
  const videos = Array.isArray(p.videos) ? p.videos : [];
  return {
    id: crypto.randomUUID(),
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    source: "manual", // بعداً: "auto" برای ثبت خودکار
    url: p.url,
    title: String(p.title || ""),
    groupName: String(p.groupName || "").trim(),
    capturedAt: new Date().toISOString(),
    pageLang: p.pageLang || "",
    images,
    videos,
    htmlBytes: new Blob([html]).size,
    textLength: visibleText.length,
    syncStatus: "local", // بعداً: "pending" | "sent" | "failed"
    html,
    visibleText,
  };
}

async function openListPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL(LIST_PAGE) });
}
