import "server-only";
import { headers } from "next/headers";
import { isIP } from "node:net";

// IP و user-agent درخواست فعلی. پشت پروکسی لیارا IP واقعی در x-forwarded-for است.
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip: fwd && isIP(fwd) ? fwd : null, userAgent: h.get("user-agent")?.slice(0, 500) ?? null };
}
