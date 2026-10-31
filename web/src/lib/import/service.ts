import "server-only";
// ورود صفحه‌ی ذخیره‌شده‌ی علی‌بابا: ذخیره در دیتابیس، تشخیص تکراری، خواندن دوباره، وضعیت. docs/infoyaarchin.md بخش ۳۶.
// ماندگاری: همه‌چیز در دیتابیس (دیسک برنامه با هر استقرار پاک می‌شود و S3 هنوز راه نیفتاده).
//   - خود فایل MHTML نگه داشته نمی‌شود (بیشترش CSS است)؛ فقط HTML اصلی فشرده (gzip) برای «خواندن دوباره».
//   - فقط عکس‌های اصلی محصول (گالری) با بایت در raw_page_images؛ عکس‌های توضیحات فقط لینک (در parsed).
// حافظه: هر بار فقط یک فایل پردازش می‌شود (صف کوتاه)؛ حداکثر حدود ۸۰ مگابایت برای فایل ۲۵ مگابایتی.
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, companyExternalIds, listingExternalIds, productListings, products, rawPageImages, rawPages } from "@/db/schema";
import { IMAGE_TYPES, sniff } from "@/lib/media/detect";
import { MhtmlError, parseMhtml } from "./alibaba/mhtml";
import { type AlibabaPage, PARSER_VERSION, parseAlibabaProduct } from "./alibaba/parse";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
// سقف عکس‌های اصلی هر صفحه در دیتابیس (عکس‌های گالری AVIF حدود ۱۵ تا ۶۰ کیلوبایت‌اند)
export const MAX_PAGE_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES = 20;
// هشدار پنل: حجم عکس‌های داخل دیتابیس از ۱ گیگابایت گذشت ← وقت راه‌اندازی فضای ابری (S3)
export const DB_IMAGES_WARN_BYTES = 1024 * 1024 * 1024;

export type RawPage = typeof rawPages.$inferSelect;
export const RAW_STATUS_FA: Record<string, string> = { new: "تازه", reviewed: "بررسی‌شده", imported: "واردشده", rejected: "ردشده" };

// ---------- صف: هر بار یک پردازش ----------
let busy = false;
const waiting: (() => void)[] = [];
const MAX_WAITING = 3;
const WAIT_MS = 30_000;
export class ImportBusyError extends Error {}

async function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) {
    if (waiting.length >= MAX_WAITING) throw new ImportBusyError();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        const i = waiting.indexOf(go);
        if (i >= 0) waiting.splice(i, 1);
        reject(new ImportBusyError());
      }, WAIT_MS);
      const go = () => {
        clearTimeout(t);
        resolve();
      };
      waiting.push(go);
    });
  }
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
    waiting.shift()?.();
  }
}

// ---------- تشخیص نوع فایل ----------
// MHTML با سرآیند MIME شروع می‌شود («From: <Saved by Blink>» یا «MIME-Version»)؛ HTML با «<»
function kindOf(buf: Buffer): "mhtml" | "html" | null {
  const head = buf.subarray(0, 2048).toString("latin1");
  if (/multipart\/related/i.test(head) && /^(From|MIME-Version|Snapshot-Content-Location|Subject|Date):/im.test(head)) return "mhtml";
  if (/^\s*(﻿)?\s*</.test(buf.subarray(0, 512).toString("utf8"))) return "html";
  return null;
}

export type ImportResult = { ok: true; id: string } | { ok: false; error: string; status: number; duplicateId?: string };

// ذخیره‌ی یک فایل آپلودی. source: upload (پنل) | extension (بعداً)
export async function importFile(buf: Buffer, opts: { fileName: string | null; by: string; source?: "upload" | "extension"; url?: string | null }): Promise<ImportResult> {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const [dup] = await db.select({ id: rawPages.id }).from(rawPages).where(eq(rawPages.sha256, sha256));
  if (dup) return { ok: false, error: "همین فایل قبلاً وارد شده است.", status: 409, duplicateId: dup.id };
  const kind = kindOf(buf);
  if (!kind) return { ok: false, error: "این فایل صفحه‌ی ذخیره‌شده نیست. در کروم Ctrl+S بزنید و «Webpage, Single File» را انتخاب کنید (فایل ‎.mhtml).", status: 415 };
  try {
    return await oneAtATime(async () => {
      let html: string;
      let url: string | null = opts.url ?? null;
      const resources: Record<string, [string, number]> = {};
      const images: { url: string; mime: string; bytes: Buffer }[] = [];
      let parsed: AlibabaPage;
      if (kind === "mhtml") {
        const m = parseMhtml(buf);
        html = m.html;
        url = m.url ?? url;
        for (const [loc, r] of m.resources) if (r.type.startsWith("image/")) resources[loc] = [r.type, r.size];
        parsed = parseAlibabaProduct(html, { url, lookup: (u) => (resources[u] ? { type: resources[u][0], size: resources[u][1] } : null) });
        // فقط عکس‌های اصلی محصول، با بررسی نوع واقعی از روی بایت‌ها
        let total = 0;
        for (const img of parsed.images) {
          const r = m.resources.get(img.url);
          if (!r || images.length >= MAX_IMAGES) continue;
          const bytes = r.read();
          const t = sniff(bytes);
          if (!t || !IMAGE_TYPES.has(t) || bytes.length > MAX_IMAGE_BYTES || total + bytes.length > MAX_PAGE_IMAGE_BYTES) continue;
          total += bytes.length;
          images.push({ url: img.url, mime: `image/${t}`, bytes });
        }
      } else {
        html = buf.toString("utf8");
        parsed = parseAlibabaProduct(html, { url });
      }
      const htmlGz = gzipSync(Buffer.from(html, "utf8"), { level: 6 });
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(rawPages)
          .values({
            source: opts.source ?? "upload",
            url: parsed.productUrl ?? url,
            externalProductId: parsed.productId,
            storeId: parsed.supplier.storeId,
            title: parsed.title,
            sha256,
            fileName: opts.fileName,
            fileBytes: buf.length,
            htmlGz,
            htmlBytes: Buffer.byteLength(html),
            resources,
            parsed,
            parserVersion: PARSER_VERSION,
            uploadedBy: opts.by,
          })
          .returning({ id: rawPages.id });
        if (images.length)
          await tx
            .insert(rawPageImages)
            .values(images.map((img, i) => ({ rawPageId: row.id, url: img.url, position: i, mime: img.mime, size: img.bytes.length, bytes: img.bytes })));
        return row.id;
      });
      return { ok: true as const, id };
    });
  } catch (e) {
    if (e instanceof ImportBusyError) return { ok: false, error: "یک فایل دیگر در حال پردازش است؛ چند ثانیه‌ی دیگر دوباره امتحان کنید.", status: 503 };
    if (e instanceof MhtmlError) return { ok: false, error: e.message, status: 422 };
    // دو آپلود هم‌زمان همان فایل: ایندکس یکتای sha256
    if (/raw_pages_sha256_uq/.test(String((e as { message?: string }).message))) return { ok: false, error: "همین فایل قبلاً وارد شده است.", status: 409 };
    throw e;
  }
}

// خواندن دوباره با خواننده‌ی فعلی، از HTML ذخیره‌شده (عکس‌ها از فایل اصلی دوباره درآورده نمی‌شوند)
export async function reparse(id: string): Promise<{ from: number; to: number } | null> {
  const [p] = await db
    .select({ htmlGz: rawPages.htmlGz, url: rawPages.url, resources: rawPages.resources, parserVersion: rawPages.parserVersion })
    .from(rawPages)
    .where(eq(rawPages.id, id));
  if (!p) return null;
  const html = gunzipSync(p.htmlGz).toString("utf8");
  const res = (p.resources ?? {}) as Record<string, [string, number]>;
  const parsed = parseAlibabaProduct(html, { url: p.url, lookup: (u) => (res[u] ? { type: res[u][0], size: res[u][1] } : null) });
  await db
    .update(rawPages)
    .set({ parsed, parserVersion: PARSER_VERSION, title: parsed.title, externalProductId: parsed.productId, storeId: parsed.supplier.storeId })
    .where(eq(rawPages.id, id));
  return { from: p.parserVersion, to: PARSER_VERSION };
}

export async function setStatus(id: string, status: "new" | "reviewed" | "rejected", by: string, reason?: string | null): Promise<RawPage["status"] | null> {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select({ status: rawPages.status }).from(rawPages).where(eq(rawPages.id, id)).for("update");
    // صفحه‌ی واردشده (PR سوم) از اینجا عوض نمی‌شود
    if (!cur || cur.status === "imported") return null;
    await tx
      .update(rawPages)
      .set({
        status,
        rejectReason: status === "rejected" ? (reason ?? null) : null,
        ...(status === "reviewed" ? { reviewedBy: by, reviewedAt: new Date() } : {}),
      })
      .where(eq(rawPages.id, id));
    // رد کردن: عکس‌ها پاک می‌شوند تا جای دیتابیس آزاد شود (HTML برای خواندن دوباره می‌ماند)
    if (status === "rejected") await tx.delete(rawPageImages).where(eq(rawPageImages.rawPageId, id));
    return cur.status;
  });
}

export type Duplicates = {
  samePage: { id: string; status: string; createdAt: Date }[];
  listing: { listingId: string; productId: string | null; productTitle: string | null } | null;
  company: { id: string; name: string } | null;
};

// همین شناسه‌ی محصول در صفحه‌های دیگر یا لیستینگ‌ها، و همین فروشنده (شناسه‌ی فروشگاه)
export async function duplicatesOf(p: Pick<RawPage, "id" | "platform" | "externalProductId" | "storeId">): Promise<Duplicates> {
  const [samePage, listing, company] = await Promise.all([
    p.externalProductId
      ? db
          .select({ id: rawPages.id, status: rawPages.status, createdAt: rawPages.createdAt })
          .from(rawPages)
          .where(and(eq(rawPages.platform, p.platform), eq(rawPages.externalProductId, p.externalProductId), ne(rawPages.id, p.id)))
          .orderBy(rawPages.createdAt)
      : Promise.resolve([]),
    p.externalProductId
      ? db
          .select({ listingId: listingExternalIds.listingId, productId: productListings.productId, productTitle: products.titleFa })
          .from(listingExternalIds)
          .innerJoin(productListings, eq(productListings.id, listingExternalIds.listingId))
          .leftJoin(products, eq(products.id, productListings.productId))
          .where(and(eq(listingExternalIds.platform, p.platform), eq(listingExternalIds.externalId, p.externalProductId)))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    p.storeId
      ? db
          .select({ id: companies.id, name: companies.nameEn })
          .from(companyExternalIds)
          .innerJoin(companies, eq(companies.id, companyExternalIds.companyId))
          .where(and(eq(companyExternalIds.platform, p.platform), eq(companyExternalIds.externalId, p.storeId)))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { samePage, listing, company };
}

// حجم کل عکس‌های داخل دیتابیس (برای هشدار ۱ گیگابایت)
export async function dbImageBytes(): Promise<number> {
  const [r] = await db
    .select({ n: sql<string>`coalesce(sum(${rawPageImages.size}), 0)` })
    .from(rawPageImages)
    .where(sql`${rawPageImages.bytes} is not null`);
  return Number(r?.n ?? 0);
}
