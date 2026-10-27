// تست واحد محافظ شبکه‌ی «وارد کردن عکس از لینک» (فقط https و IP عمومی). docs/infoyaarchin.md بخش ۲۷.
// اجرا (از پوشه‌ی web): npm run test:unit
import { checkImportUrl, isPublicIp } from "../../src/lib/media/net-guard.ts";
let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};
for (const ip of [
  "127.0.0.1",
  "10.1.2.3",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254",
  "100.64.0.1",
  "0.0.0.0",
  "224.0.0.1",
  "::1",
  "::",
  "fe80::1",
  "fd00::1",
  "fc00::1",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "64:ff9b::7f00:1",
  "2001:db8::1",
  "ff02::1",
  "not-an-ip",
])
  ok(!isPublicIp(ip), `blocked ${ip}`);
for (const ip of ["8.8.8.8", "185.199.108.133", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) ok(isPublicIp(ip), `public ${ip}`);
const bad = [
  "http://example.com/a.jpg",
  "ftp://example.com/a",
  "https://user:pw@example.com/a.jpg",
  "https://example.com:8443/a.jpg",
  "https://127.0.0.1/a.jpg",
  "https://[::1]/a.jpg",
  "https://10.0.0.5/x",
  "https://localhost/x",
  "https://intranet/x",
  "https://printer.local/x",
  "javascript:alert(1)",
  "file:///etc/passwd",
  "https://169.254.169.254/latest/meta-data",
  "",
  "https://" + "a".repeat(2001) + ".com",
];
for (const u of bad) ok("error" in checkImportUrl(u), `reject ${u.slice(0, 50)}`);
for (const u of ["https://sc04.alicdn.com/kf/Habc.jpg", "https://example.com:443/a.jpg?x=1", "https://8.8.8.8/a.png"]) ok("url" in checkImportUrl(u), `accept ${u}`);
console.log(`${n} checks${fails ? `, ${fails} FAILED` : ", ALL PASSED"}`);
process.exitCode = fails ? 1 : 0;
