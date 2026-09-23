import { listCaptures, getFullCapture, deleteCapture } from "../shared/db.js";
import { CAPTURE_SCHEMA_VERSION, EXPORT_FOLDER } from "../shared/config.js";

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const summaryEl = document.getElementById("summary");
const exportBtn = document.getElementById("export");
const rowTpl = document.getElementById("row");

const fmtDate = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
const fmtNum = new Intl.NumberFormat("fa-IR");

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${fmtNum.format(+(bytes / 1024 / 1024).toFixed(1))} مگابایت`;
  return `${fmtNum.format(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

async function render() {
  const items = await listCaptures();
  listEl.replaceChildren();
  emptyEl.hidden = items.length > 0;
  exportBtn.disabled = items.length === 0;
  const total = items.reduce((s, c) => s + (c.htmlBytes || 0), 0);
  summaryEl.textContent = items.length ? `${fmtNum.format(items.length)} صفحه  •  ${fmtSize(total)}` : "";

  for (const c of items) {
    const li = rowTpl.content.firstElementChild.cloneNode(true);
    const group = li.querySelector(".group");
    group.textContent = c.groupName || "بدون گروه";
    group.classList.toggle("none", !c.groupName);
    const a = li.querySelector(".title");
    a.textContent = c.title || c.url;
    a.href = c.url;
    a.title = c.url;
    li.querySelector(".meta").textContent = [
      fmtDate.format(new Date(c.capturedAt)),
      `${fmtNum.format(c.images?.length || 0)} عکس`,
      `${fmtNum.format(c.videos?.length || 0)} ویدیو`,
      fmtSize(c.htmlBytes || 0),
    ].join("  •  ");
    li.querySelector(".del").addEventListener("click", async () => {
      if (!confirm(`«${c.title || c.url}» حذف شود؟`)) return;
      await deleteCapture(c.id);
      render();
    });
    listEl.append(li);
  }
}

async function exportJson() {
  exportBtn.disabled = true;
  const label = exportBtn.textContent;
  exportBtn.textContent = "در حال ساخت فایل…";
  try {
    const metas = await listCaptures();
    // یکی‌یکی می‌خوانیم تا همه‌ی HTMLها هم‌زمان در حافظه دو بار کپی نشوند.
    const parts = [];
    for (const m of metas) {
      const full = await getFullCapture(m.id);
      if (full) parts.push(JSON.stringify(full));
    }
    const header = JSON.stringify({
      format: "yarchin-captures",
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      count: parts.length,
    });
    // {"format":...,"captures":[...]}
    const blob = new Blob([header.slice(0, -1), ',"captures":[', parts.join(","), "]}"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await chrome.downloads.download({
      url,
      filename: `${EXPORT_FOLDER}/yarchin-export-${stamp}.json`,
      saveAs: false,
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    alert(`خروجی ساخته نشد: ${e?.message || e}`);
  } finally {
    exportBtn.textContent = label;
    exportBtn.disabled = false;
  }
}

exportBtn.addEventListener("click", exportJson);
render();
// وقتی به این تب برمی‌گردید، ثبت‌های تازه نمایش داده شوند.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});
