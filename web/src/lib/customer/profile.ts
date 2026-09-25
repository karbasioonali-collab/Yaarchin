import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { BUSINESS_TYPES, customerInterests, customerProfiles } from "@/db/schema";
import { customerReady } from "@/lib/db-ready";

// پروفایل کسب‌وکار مشتری (اختیاری). برای امتیاز جدیت مشتری هم استفاده می‌شود.
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_FA: Record<BusinessType, string> = {
  shop: "مغازه",
  wholesale: "عمده‌فروش",
  online: "فروش آنلاین",
  personal: "مصرف شخصی",
  other: "سایر",
};

export function toBusinessType(v: unknown): BusinessType | null {
  return typeof v === "string" && (BUSINESS_TYPES as readonly string[]).includes(v) ? (v as BusinessType) : null;
}

export type CustomerProfile = {
  businessType: BusinessType | null;
  city: string | null;
  hasImportExperience: boolean | null;
  interestIds: string[];
  updatedAt: Date | null;
};

export async function getProfile(userId: string): Promise<CustomerProfile> {
  const empty: CustomerProfile = { businessType: null, city: null, hasImportExperience: null, interestIds: [], updatedAt: null };
  if (!(await customerReady())) return empty;
  const [[p], interests] = await Promise.all([
    db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)),
    db.select({ id: customerInterests.categoryId }).from(customerInterests).where(eq(customerInterests.userId, userId)),
  ]);
  return {
    businessType: toBusinessType(p?.businessType),
    city: p?.city ?? null,
    hasImportExperience: p?.hasImportExperience ?? null,
    interestIds: interests.map((i) => i.id),
    updatedAt: p?.updatedAt ?? null,
  };
}

// ذخیره‌ی کامل پروفایل (دسته‌ها جایگزین می‌شوند). interestIds باید قبلاً با دسته‌های معتبر فیلتر شده باشد.
export async function saveProfile(userId: string, p: Omit<CustomerProfile, "updatedAt">): Promise<void> {
  const values = { businessType: p.businessType, city: p.city, hasImportExperience: p.hasImportExperience };
  await db.transaction(async (tx) => {
    await tx
      .insert(customerProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: customerProfiles.userId, set: { ...values, updatedAt: new Date() } });
    await tx.delete(customerInterests).where(eq(customerInterests.userId, userId));
    if (p.interestIds.length) {
      await tx.insert(customerInterests).values(p.interestIds.map((categoryId) => ({ userId, categoryId })));
    }
  });
}
