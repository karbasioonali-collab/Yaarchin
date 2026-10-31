"use server";

import { revalidatePath } from "next/cache";
import { asc, lt } from "drizzle-orm";
import type { FormState } from "@/components/ui/ActionForm";
import { db } from "@/db/client";
import { rawPages } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/can";
import { PARSER_VERSION } from "@/lib/import/alibaba/parse";
import { reparse, setStatus } from "@/lib/import/service";
import { importReady } from "@/lib/db-ready";

// نوشتنی‌های «ورود از علی‌بابا» (catalog.import). docs/infoyaarchin.md بخش ۳۶.
const UUID = /^[0-9a-f-]{36}$/i;
const idOf = (fd: FormData) => {
  const id = String(fd.get("id") ?? "");
  return UUID.test(id) ? id : null;
};
const done = (id: string) => {
  revalidatePath("/admin/import", "layout");
  revalidatePath(`/admin/import/${id}`);
};

export async function reviewedAction(fd: FormData): Promise<void> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return;
  const before = await setStatus(id, "reviewed", a.user.id);
  if (before) await logActivity({ actorUserId: a.user.id, action: "import.reviewed", entityType: "raw_page", entityId: id, before: { status: before } });
  done(id);
}

export async function rejectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return { error: "صفحه نامعتبر است." };
  const reason = String(fd.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  const before = await setStatus(id, "rejected", a.user.id, reason || null);
  if (!before) return { error: "این صفحه وارد شده و قابل رد کردن نیست." };
  await logActivity({ actorUserId: a.user.id, action: "import.reject", entityType: "raw_page", entityId: id, before: { status: before }, after: { reason } });
  done(id);
  return { ok: "رد شد." };
}

export async function restoreAction(fd: FormData): Promise<void> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return;
  const before = await setStatus(id, "new", a.user.id);
  if (before) await logActivity({ actorUserId: a.user.id, action: "import.restore", entityType: "raw_page", entityId: id, before: { status: before } });
  done(id);
}

export async function reparseAction(fd: FormData): Promise<void> {
  const a = await requirePermission("catalog.import");
  const id = idOf(fd);
  if (!id || !(await importReady())) return;
  const r = await reparse(id);
  if (r)
    await logActivity({
      actorUserId: a.user.id,
      action: "import.reparse",
      entityType: "raw_page",
      entityId: id,
      before: { parserVersion: r.from },
      after: { parserVersion: r.to },
    });
  done(id);
}

// همه‌ی صفحه‌هایی که با خواننده‌ی قدیمی‌تر خوانده شده‌اند، یکی‌یکی (حداکثر ۲۰۰ در هر بار)
export async function reparseOldAction(): Promise<FormState> {
  const a = await requirePermission("catalog.import");
  if (!(await importReady())) return { error: "بعد از migration ۰۰۱۲." };
  const old = await db.select({ id: rawPages.id }).from(rawPages).where(lt(rawPages.parserVersion, PARSER_VERSION)).orderBy(asc(rawPages.createdAt)).limit(200);
  for (const p of old) await reparse(p.id);
  if (old.length) await logActivity({ actorUserId: a.user.id, action: "import.reparse_all", entityType: "raw_page", after: { count: old.length, parserVersion: PARSER_VERSION } });
  revalidatePath("/admin/import", "layout");
  return { ok: old.length ? `${old.length.toLocaleString("fa-IR")} صفحه دوباره خوانده شد.` : "صفحه‌ی قدیمی‌ای نیست." };
}
