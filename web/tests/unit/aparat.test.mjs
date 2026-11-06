// تست واحد بخش ۵۵: خواندن لینک ویدیو آپارات (شکل‌های درست و غلط) و کلید ذخیره و آدرس پخش‌کننده.
import { readFileSync } from "node:fs";
import { APARAT_ERR, aparatEmbedUrl, aparatHash, aparatKey, aparatPageUrl, isAparatKey, parseAparatLink } from "../../src/lib/media/aparat.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
const hashOf = (s) => {
  const r = parseAparatLink(s);
  return "hash" in r ? r.hash : `ERR:${r.error}`;
};

// ---------- شکل‌های درست ----------
for (const [s, h] of [
  ["https://www.aparat.com/v/abc12", "abc12"],
  ["https://aparat.com/v/abc12", "abc12"],
  ["http://www.aparat.com/v/abc12", "abc12"],
  ["www.aparat.com/v/abc12", "abc12"],
  ["aparat.com/v/Xy9Kq", "Xy9Kq"],
  ["https://m.aparat.com/v/abc12", "abc12"],
  ["https://www.aparat.com/v/abc12/", "abc12"],
  ["https://www.aparat.com/v/abc12/مخلوط-کن-قابل-حمل", "abc12"],
  ["https://www.aparat.com/v/abc12/%D9%85%D8%AE%D9%84%D9%88%D8%B7", "abc12"],
  ["https://www.aparat.com/v/abc12?playlist=123&t=10", "abc12"],
  ["https://www.aparat.com/v/abc12#comments", "abc12"],
  ["HTTPS://WWW.APARAT.COM/v/abc12", "abc12"],
  ["  https://www.aparat.com/v/abc12  ", "abc12"],
  ["‏https://www.aparat.com/v/abc12‎", "abc12"],
  ["https://www.aparat.com/video/video/embed/videohash/abc12/vt/frame", "abc12"],
  ["https://www.aparat.com/video/video/embed/videohash/abc12/vt/frame?titleShow=true", "abc12"],
])
  ok(hashOf(s) === h, `accepted: ${JSON.stringify(s)} → ${hashOf(s)}`);

// ---------- شکل‌های غلط ----------
for (const [s, e] of [
  ["", APARAT_ERR.empty],
  ["   ", APARAT_ERR.empty],
  ["abc12", APARAT_ERR.notLink],
  ["لینک ویدیو", APARAT_ERR.notLink],
  ["https://www.aparat.com/v/abc12 https://www.aparat.com/v/def34", APARAT_ERR.notLink],
  ["ftp://www.aparat.com/v/abc12", APARAT_ERR.notLink],
  ["javascript:alert(1)", APARAT_ERR.notLink],
  ["https://www.youtube.com/watch?v=abc12", APARAT_ERR.otherSite],
  ["https://aparat.com.evil.com/v/abc12", APARAT_ERR.otherSite],
  ["https://evilaparat.com/v/abc12", APARAT_ERR.otherSite],
  ["https://www.aparat.com:8443/v/abc12", APARAT_ERR.otherSite],
  ["https://user@www.aparat.com/v/abc12", APARAT_ERR.otherSite],
  ["https://www.alibaba.com/product-detail/x.html", APARAT_ERR.otherSite],
  ["https://www.aparat.com/yarchin", APARAT_ERR.notVideo],
  ["https://www.aparat.com/", APARAT_ERR.notVideo],
  ["https://www.aparat.com/v/", APARAT_ERR.notVideo],
  ["https://www.aparat.com/v/ab", APARAT_ERR.notVideo],
  ["https://www.aparat.com/v/abc-12", APARAT_ERR.notVideo],
  ["https://www.aparat.com/v/abc12%22onload", APARAT_ERR.notVideo],
  ["https://www.aparat.com/v/abcdefghijklmnopq", APARAT_ERR.notVideo],
  ["https://www.aparat.com/search/blender", APARAT_ERR.notVideo],
])
  ok(hashOf(s) === `ERR:${e}`, `rejected: ${JSON.stringify(s)} → ${hashOf(s)}`);
ok(
  Object.values(APARAT_ERR).every((m) => /[آ-ی]/.test(m)),
  "all errors in Persian",
);

// ---------- کلید و آدرس‌ها ----------
ok(aparatKey("abc12") === "aparat:abc12" && isAparatKey("aparat:abc12") && aparatHash("aparat:abc12") === "abc12", "storage key aparat:<code>");
ok(!isAparatKey("aparat:ab") && !isAparatKey("aparat:abc-12") && !isAparatKey("vid/2026/01/x.mp4") && aparatHash("https://x") === null, "key validated");
ok(aparatPageUrl("abc12") === "https://www.aparat.com/v/abc12", "page url");
ok(aparatEmbedUrl("abc12") === "https://www.aparat.com/video/video/embed/videohash/abc12/vt/frame?recom=self", "embed url with recom=self");

// ---------- سوئیچ و گالری ----------
const seed = JSON.parse(readFileSync(new URL("../../src/db/seed-data.json", import.meta.url), "utf8"));
const sw = seed.settings.find((x) => x.key === "media.video_upload");
ok(sw && sw.value === false && sw.groupKey === "media", "seed: video upload switch, default off");
const gal = readFileSync(new URL("../../src/components/site/Gallery.tsx", import.meta.url), "utf8");
const sandbox = /sandbox="([^"]*)"/.exec(gal)?.[1] ?? "";
ok(
  sandbox === "allow-scripts allow-same-origin allow-presentation" && /allowFullScreen/.test(gal),
  `iframe: minimal sandbox (no popups/top-navigation), fullscreen allowed (${sandbox})`,
);

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
