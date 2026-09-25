import "server-only";
import { NextResponse } from "next/server";

// پاسخ‌های یکسان API عمومی (/api/v1). خطاها: { error: کد انگلیسی، message: متن فارسی }
export function apiJson(data: unknown, init?: { status?: number; cache?: boolean }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { "cache-control": init?.cache ? "public, max-age=60, stale-while-revalidate=300" : "no-store" },
  });
}

export function apiError(status: number, error: string, message: string) {
  return apiJson({ error, message }, { status });
}

export const loginRequired = () => apiError(401, "login_required", "برای این کار باید وارد شوید.");
export const comingSoon = () => apiError(501, "not_available_yet", "این بخش به‌زودی فعال می‌شود.");
export const featureOff = () => apiError(503, "feature_disabled", "این بخش فعلاً خاموش است.");
