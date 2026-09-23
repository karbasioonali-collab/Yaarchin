// جمع‌آوری داده‌ی خام صفحه. «بی‌مغز»: هیچ فیلدی استخراج نمی‌شود، فقط خام.
// content script ماژول نیست، پس از طریق globalThis در اختیار ui.js قرار می‌گیرد.

(() => {
  const ROOT_TAG = "yarchin-capture-root";

  function absUrl(raw) {
    if (!raw || typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("javascript:")) return null;
    try {
      const u = new URL(v, document.baseURI);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  function fromSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  // علی‌بابا عکس‌ها را lazy-load می‌کند؛ attributeهای رایج lazy را هم می‌خوانیم.
  const LAZY_ATTRS = ["src", "data-src", "data-original", "data-lazy-src", "data-ks-lazyload", "data-image"];

  function collectImages() {
    const out = new Set();
    const add = (v) => {
      const u = absUrl(v);
      if (u) out.add(u);
    };

    document.querySelectorAll("img").forEach((img) => {
      add(img.currentSrc);
      LAZY_ATTRS.forEach((a) => add(img.getAttribute(a)));
      fromSrcset(img.getAttribute("srcset")).forEach(add);
      fromSrcset(img.getAttribute("data-srcset")).forEach(add);
    });
    document.querySelectorAll("picture source[srcset]").forEach((s) => {
      fromSrcset(s.getAttribute("srcset")).forEach(add);
    });
    document
      .querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]')
      .forEach((m) => add(m.getAttribute("content") || m.getAttribute("href")));
    // تصویرهای پس‌زمینه در style درون‌خطی
    document.querySelectorAll('[style*="background"]').forEach((el) => {
      const m = el.getAttribute("style").match(/url\((['"]?)(.*?)\1\)/g) || [];
      m.forEach((x) => add(x.replace(/^url\((['"]?)/, "").replace(/(['"]?)\)$/, "")));
    });
    return [...out];
  }

  function collectVideos() {
    const out = new Set();
    const add = (v) => {
      const u = absUrl(v);
      if (u) out.add(u);
    };
    document.querySelectorAll("video").forEach((v) => {
      add(v.currentSrc);
      add(v.getAttribute("src"));
      add(v.getAttribute("data-src"));
      v.querySelectorAll("source").forEach((s) => add(s.getAttribute("src")));
    });
    document
      .querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]')
      .forEach((m) => add(m.getAttribute("content")));
    return [...out];
  }

  // HTML کامل، بدون عنصر خود اکستنشن.
  function serializeHtml() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll(ROOT_TAG).forEach((el) => el.remove());
    const dt = document.doctype;
    const doctype = dt
      ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ""}${dt.systemId ? ` "${dt.systemId}"` : ""}>\n`
      : "";
    return doctype + clone.outerHTML;
  }

  function collectVisibleText() {
    // innerText فقط متن قابل‌مشاهده را می‌دهد؛ UI ما در shadow DOM است و داخلش نمی‌آید.
    return (document.body?.innerText || "").trim();
  }

  function collectPage({ groupName }) {
    return {
      url: location.href,
      title: document.title,
      pageLang: document.documentElement.lang || "",
      groupName,
      html: serializeHtml(),
      visibleText: collectVisibleText(),
      images: collectImages(),
      videos: collectVideos(),
    };
  }

  globalThis.YarchinCapture = { ROOT_TAG, collectPage };
})();
