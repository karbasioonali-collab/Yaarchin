// تشخیص نوع واقعی فایل از چند بایت اول (نه از اسم یا Content-Type که مرورگر/کاربر می‌فرستد).
// فقط این‌ها پذیرفته می‌شوند: عکس JPEG، PNG، WebP، GIF، AVIF و ویدیو MP4، WebM. SVG، HEIC و MOV با پیام روشن رد می‌شوند.
export type Sniffed = "jpeg" | "png" | "webp" | "gif" | "avif" | "mp4" | "webm" | "heic" | "mov" | "svg" | null;

export const IMAGE_TYPES = new Set<Sniffed>(["jpeg", "png", "webp", "gif", "avif"]);
export const VIDEO_TYPES = new Set<Sniffed>(["mp4", "webm"]);

const HEIC = new Set(["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const MP4 = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "m4v ", "mmp4", "f4v ", "msnv"]);

export function sniff(b: Uint8Array): Sniffed {
  if (b.length < 12) return null;
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  const str = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (str(0, 4) === "RIFF" && str(8, 4) === "WEBP") return "webp";
  if (str(0, 4) === "GIF8") return "gif";
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "webm";
  if (str(4, 4) === "ftyp") {
    // برند اصلی و برندهای سازگار جعبه‌ی ftyp
    const size = Math.min((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3], b.length, 64);
    const brands = [str(8, 4)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(str(i, 4));
    const lower = brands.map((x) => x.toLowerCase());
    if (lower[0] === "avif" || lower[0] === "avis") return "avif";
    if (HEIC.has(lower[0])) return "heic";
    if (lower[0] === "qt  ") return "mov";
    if (lower.some((x) => MP4.has(x))) return "mp4";
    return null;
  }
  // SVG/XML/HTML متنی است و با «<» (یا BOM و فاصله) شروع می‌شود
  const head = str(0, Math.min(b.length, 256))
    .replace(/^﻿?\s*/, "")
    .toLowerCase();
  if (head.startsWith("<")) return "svg";
  return null;
}

// پیام فارسی برای نوع پذیرفته‌نشده
export function rejectReason(t: Sniffed, want: "image" | "image_or_video"): string {
  if (t === "svg") return "فایل SVG (یا متنی) پذیرفته نمی‌شود؛ فقط عکس JPEG، PNG، WebP، GIF یا AVIF.";
  if (t === "heic") return "عکس HEIC آیفون پذیرفته نمی‌شود. در آیفون: تنظیمات ← دوربین ← فرمت‌ها ← «Most Compatible»، یا عکس را JPEG بفرستید.";
  if (t === "mov") return "ویدیوی MOV (آیفون) پذیرفته نمی‌شود؛ فقط MP4 یا WebM. در آیفون: تنظیمات ← دوربین ← فرمت‌ها ← «Most Compatible».";
  if (VIDEO_TYPES.has(t) && want === "image") return "اینجا فقط عکس پذیرفته می‌شود.";
  return want === "image" ? "نوع فایل پذیرفته نیست؛ فقط عکس JPEG، PNG، WebP، GIF یا AVIF." : "نوع فایل پذیرفته نیست؛ عکس (JPEG، PNG، WebP، GIF، AVIF) یا ویدیو (MP4، WebM).";
}
