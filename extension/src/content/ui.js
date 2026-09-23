// دکمه‌ی شناور «ثبت این صفحه» و کادر اسم محصول/گروه.
// داخل Shadow DOM تا CSS علی‌بابا روی آن اثر نگذارد و برعکس.
// ثبت فقط با کلیک کاربر انجام می‌شود؛ هیچ صفحه‌ای خودکار باز نمی‌شود.

(() => {
  if (window.top !== window) return; // فقط فریم اصلی
  const { ROOT_TAG, collectPage } = globalThis.YarchinCapture || {};
  if (!collectPage || document.querySelector(ROOT_TAG)) return;

  // باید با src/shared/config.js یکی باشد (content script نمی‌تواند ماژول import کند).
  const MSG = {
    SAVE_CAPTURE: "yarchin/save-capture",
    GET_LAST_GROUP: "yarchin/get-last-group",
    OPEN_LIST: "yarchin/open-list",
  };
  const FONT_FAMILY = "YarchinVazirmatn";

  function send(type, extra = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, ...extra }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (!res?.ok) return reject(new Error(res?.error || "unknown error"));
          resolve(res.data);
        });
      } catch (e) {
        // بعد از reload اکستنشن، content script قدیمی ارتباطش قطع می‌شود.
        reject(e);
      }
    });
  }

  // فونت از داخل اکستنشن (آفلاین). با ArrayBuffer بارگذاری می‌شود تا CSP صفحه جلویش را نگیرد.
  async function loadFont() {
    try {
      const res = await fetch(chrome.runtime.getURL("assets/fonts/Vazirmatn-Variable.woff2"));
      const face = new FontFace(FONT_FAMILY, await res.arrayBuffer(), { weight: "100 900" });
      await face.load();
      document.fonts.add(face);
    } catch {
      // فونت سیستم جایگزین می‌شود.
    }
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap {
      --green: #2F7D5C; --green-dark: #1B4D3E;
      --orange: #FF7A00; --orange-dark: #E86A00;
      --bg: #F7F7F5; --text: #222222; --white: #FFFFFF;
      position: fixed; left: 20px; bottom: 20px; z-index: 2147483647;
      direction: rtl; font-family: "${FONT_FAMILY}", Tahoma, sans-serif;
      font-size: 14px; line-height: 1.6; color: var(--text);
      display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
    }
    button { font: inherit; cursor: pointer; border: 0; }
    .fab {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 18px; border-radius: 999px;
      background: var(--green); color: var(--white); font-weight: 600;
      box-shadow: 0 6px 18px rgba(27, 77, 62, .25);
      transition: background .15s, transform .15s;
    }
    .fab:hover { background: var(--green-dark); transform: translateY(-1px); }
    .fab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); }
    .panel {
      width: 300px; background: var(--white); border-radius: 16px; padding: 16px;
      box-shadow: 0 12px 32px rgba(34, 34, 34, .16);
      display: none; flex-direction: column; gap: 12px;
    }
    .panel.open { display: flex; }
    .head { display: flex; align-items: center; justify-content: space-between; }
    .brand { font-weight: 800; color: var(--green-dark); }
    .brand span { color: var(--orange); }
    .x { background: transparent; color: #222222; opacity: .5; font-size: 18px; line-height: 1; padding: 4px; }
    .x:hover { opacity: 1; }
    label { font-size: 13px; font-weight: 600; }
    input {
      width: 100%; margin-top: 6px; padding: 9px 12px; font: inherit; color: var(--text);
      border: 1.5px solid rgba(34, 34, 34, .12); border-radius: 10px; background: var(--bg); outline: none;
    }
    input:focus { border-color: var(--green); background: var(--white); }
    .url { font-size: 11px; opacity: .6; direction: ltr; text-align: left;
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row { display: flex; gap: 8px; }
    .primary {
      flex: 1; padding: 10px; border-radius: 10px; font-weight: 700;
      background: var(--orange); color: var(--white);
    }
    .primary:hover { background: var(--orange-dark); }
    .primary:disabled { opacity: .6; cursor: default; }
    .ghost { padding: 10px 12px; border-radius: 10px; background: var(--bg); color: var(--green-dark); }
    .ghost:hover { background: rgba(34, 34, 34, .06); }
    .toast {
      padding: 10px 14px; border-radius: 12px; background: var(--white);
      box-shadow: 0 8px 24px rgba(34, 34, 34, .14); max-width: 300px;
      border-right: 4px solid var(--green); display: none;
    }
    .toast.show { display: block; }
    .toast.err { border-right-color: var(--orange-dark); }
  `;

  const host = document.createElement(ROOT_TAG);
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>${CSS}</style>
    <div class="wrap">
      <div class="toast" role="status" aria-live="polite"></div>
      <div class="panel" role="dialog" aria-label="ثبت این صفحه">
        <div class="head">
          <div class="brand">یار<span>چین</span></div>
          <button class="x" type="button" aria-label="بستن">×</button>
        </div>
        <div>
          <label for="g">اسم محصول / گروه</label>
          <input id="g" type="text" autocomplete="off" placeholder="مثلاً: هدفون بی‌سیم" />
        </div>
        <div class="url"></div>
        <div class="row">
          <button class="primary" type="button">ثبت</button>
          <button class="ghost list" type="button">لیست</button>
        </div>
      </div>
      <button class="fab" type="button"><span class="dot"></span>ثبت این صفحه</button>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const panel = $(".panel");
  const input = $("#g");
  const saveBtn = $(".primary");
  const toast = $(".toast");
  let toastTimer = null;

  function showToast(text, isError = false) {
    toast.textContent = text;
    toast.classList.toggle("err", isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), isError ? 6000 : 3500);
  }

  async function openPanel() {
    panel.classList.add("open");
    $(".url").textContent = location.href;
    if (!input.value) {
      try {
        input.value = await send(MSG.GET_LAST_GROUP);
      } catch {
        /* اولین بار خالی است */
      }
    }
    input.focus();
    input.select();
  }

  function closePanel() {
    panel.classList.remove("open");
  }

  async function save() {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "در حال ثبت…";
    try {
      const payload = collectPage({ groupName: input.value.trim() });
      await send(MSG.SAVE_CAPTURE, { payload });
      closePanel();
      const fa = (n) => n.toLocaleString("fa-IR");
      const kb = Math.max(1, Math.round(new Blob([payload.html]).size / 1024));
      showToast(`ثبت شد ✓  ${fa(payload.images.length)} عکس، ${fa(payload.videos.length)} ویدیو، ${fa(kb)} کیلوبایت`);
    } catch (e) {
      const msg = /context invalidated/i.test(String(e?.message))
        ? "اکستنشن دوباره بارگذاری شده؛ صفحه را رفرش کنید."
        : `ثبت نشد: ${e?.message || e}`;
      showToast(msg, true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "ثبت";
    }
  }

  $(".fab").addEventListener("click", () => (panel.classList.contains("open") ? closePanel() : openPanel()));
  $(".x").addEventListener("click", closePanel);
  saveBtn.addEventListener("click", save);
  $(".list").addEventListener("click", () => send(MSG.OPEN_LIST).catch((e) => showToast(String(e.message), true)));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") closePanel();
  });
  // کلیدهای تایپ‌شده به میانبرهای صفحه‌ی علی‌بابا نرسند.
  ["keydown", "keyup", "keypress"].forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));

  // روی documentElement، نه body، تا در innerText صفحه نیاید.
  document.documentElement.appendChild(host);
  loadFont();
})();
