import { NextResponse, type NextRequest } from "next/server";

// بررسی سریع: بدون کوکی نشست، صفحه‌های پنل به ورود هدایت می‌شوند.
// بررسی واقعی (اعتبار نشست، نقش، ورود دومرحله‌ای، دسترسی) در requireStaff/requirePermission است.
const PUBLIC_ADMIN = ["/admin/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_ADMIN.some((p) => pathname === p)) return NextResponse.next();
  if (!request.cookies.has("yc_session")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
