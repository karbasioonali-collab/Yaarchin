// فایل‌های آپلودی و واردشده از لینک (migration ۰۰۰۸). docs/infoyaarchin.md بخش ۲۶ و docs/db/0008-media.md
// هر ردیف = یک فایل در storage (دیسک برنامه در حالت آزمایشی یا فضای ابری لیارا). جای استفاده‌ی فایل همان «کلید» است که
// در product_media.storage_key، categories.image یا اسلاید سایت ذخیره می‌شود؛ پس به جدول‌های قبلی ستونی اضافه نشد.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_common";
import { users } from "./auth";

export const LOGO_CHECK_STATES = ["unchecked", "pending", "clean", "has_logo", "error"] as const;

export const mediaFiles = pgTable(
  "media_files",
  {
    id: id(),
    // کلید storage. عکس: img/2026/10/<تصادفی> (اندازه‌ها: <کلید>-480.webp، -1000، -1800). ویدیو: vid/2026/10/<تصادفی>.mp4
    key: text("key").notNull(),
    // local = دیسک برنامه (حالت آزمایشی، با هر استقرار پاک می‌شود) | s3 = فضای ابری
    storage: text("storage", { enum: ["local", "s3"] }).notNull(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    // نوع فایل ذخیره‌شده (عکس همیشه image/webp)
    mime: text("mime").notNull(),
    // جمع حجم همه‌ی اندازه‌ها (بایت)
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    // عرض اندازه‌های ساخته‌شده، مثل [480, 1000, 1800]
    variants: jsonb("variants").$type<number[]>(),
    // اثر انگشت فایل ورودی؛ برای اینکه یک عکس (مثلاً از اکستنشن) دو بار ذخیره نشود
    sha256: text("sha256").notNull(),
    originalName: text("original_name"),
    // upload = از پنل | url = از لینک | extension = از اکستنشن
    source: text("source", { enum: ["upload", "url", "extension"] })
      .notNull()
      .default("upload"),
    sourceUrl: text("source_url"),
    // برای چه آپلود شد: product | poster | category | slide
    purpose: text("purpose").notNull(),
    // جای «تشخیص لوگو با AI» (فعلاً فقط ساختار؛ همه unchecked می‌مانند)
    logoCheck: text("logo_check", { enum: LOGO_CHECK_STATES }).notNull().default("unchecked"),
    logoCheckAt: timestamp("logo_check_at", { withTimezone: true }),
    logoCheckNote: text("logo_check_note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("media_files_key_uq").on(t.key),
    index("media_files_sha256_idx").on(t.sha256),
    index("media_files_created_idx").on(t.createdAt),
    check("media_files_storage_check", sql`${t.storage} in ('local', 's3')`),
    check("media_files_kind_check", sql`${t.kind} in ('image', 'video')`),
    check("media_files_source_check", sql`${t.source} in ('upload', 'url', 'extension')`),
    check("media_files_logo_check_check", sql`${t.logoCheck} in ('unchecked', 'pending', 'clean', 'has_logo', 'error')`),
    check("media_files_bytes_check", sql`${t.bytes} >= 0`),
  ],
);
