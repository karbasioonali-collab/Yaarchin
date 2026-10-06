// بررسی امنیتی لینکی که سایت خودش دانلود می‌کند (وارد کردن عکس از لینک؛ جلوگیری از SSRF).
// بدون این بررسی، کسی می‌توانست با دادن لینک «http://127.0.0.1:…» یا آدرس شبکه‌ی داخلی لیارا، سرور را وادار کند
// به سرویس‌های داخلی درخواست بفرستد. docs/infoyaarchin.md بخش ۲۷.
// این فایل server-only نیست تا تست واحد بتواند مستقیم importش کند.
import { BlockList, isIP } from "node:net";

// همه‌ی بازه‌های غیرعمومی: محلی، شبکه‌ی خصوصی، link-local (از جمله 169.254.169.254 متادیتای ابر)، CGNAT، مستندات، multicast، رزرو
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  // ::ffff:0:0/96 (IPv4 داخل IPv6) اینجا نیست: BlockList نود این قاعده را روی همه‌ی IPv4ها هم اعمال می‌کند و هر IP عمومی را می‌بندد.
  // آن حالت پایین در isPublicIp با قاعده‌ی IPv4 سنجیده می‌شود.
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

export function isPublicIp(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) return !blocked.check(addr, "ipv4");
  if (v === 6) {
    // IPv4 داخل IPv6 (مثل ::ffff:127.0.0.1) با قاعده‌ی IPv4 سنجیده می‌شود
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
    if (m) return !blocked.check(m[1], "ipv4");
    // شکل هگز همان (مثل ::ffff:7f00:1) — بی‌خطرترین کار: رد
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(addr)) return false;
    return !blocked.check(addr, "ipv6");
  }
  return false;
}

export const MAX_URL_LENGTH = 2000;

// فقط https، پورت پیش‌فرض ۴۴۳، بدون نام کاربری/رمز در لینک، و اگر میزبان خودش IP است باید عمومی باشد.
// IP واقعی اسم دامنه موقع اتصال بررسی می‌شود (fetch-remote.ts) تا DNS نتواند بعد از بررسی عوض شود.
export function checkImportUrl(raw: string): { url: URL } | { error: string } {
  const s = raw.trim();
  if (!s) return { error: "لینک خالی است." };
  if (s.length > MAX_URL_LENGTH) return { error: "لینک خیلی بلند است." };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { error: "لینک معتبر نیست." };
  }
  if (u.protocol !== "https:") return { error: "فقط لینک https:// پذیرفته می‌شود." };
  if (u.username || u.password) return { error: "لینک نباید نام کاربری یا رمز داشته باشد." };
  if (u.port && u.port !== "443") return { error: "لینک با پورت غیرعادی پذیرفته نمی‌شود." };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicIp(host)) return { error: "لینک به آدرس داخلی یا خصوصی اشاره می‌کند." };
  if (!isIP(host) && (!host.includes(".") || /\.(local|internal|localhost|lan|home|corp)$/i.test(host) || /^localhost$/i.test(host))) {
    return { error: "لینک به آدرس داخلی یا خصوصی اشاره می‌کند." };
  }
  return { url: u };
}
