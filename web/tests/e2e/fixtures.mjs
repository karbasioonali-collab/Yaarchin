// فایل‌های نمونه‌ی تست آپلود (عکس با EXIF و چرخش، PNG، WebP، SVG خطرناک، HEIC و MOV ساختگی، MP4 کوچک و بزرگ، JPEG خراب و بزرگ).
// هر بار در یک پوشه‌ی موقت ساخته می‌شوند؛ چیزی در ریپو ذخیره نمی‌شود. docs/infoyaarchin.md بخش ۲۶.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

export const sharp = createRequire(new URL("../../package.json", import.meta.url))("sharp");

export async function makeFixtures() {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), "yc-fx-"));
  const grad = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } });
  await grad(2400, 1600, "#2F7D5C")
    .composite([{ input: Buffer.from(`<svg width="2400" height="1600"><rect x="0" y="0" width="600" height="400" fill="#FF7A00"/></svg>`) }])
    .jpeg({ quality: 90 })
    // sharp ۰٫۳۵: Orientation داخل withExif نادیده گرفته می‌شود؛ چرخش با withMetadata
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Copyright: "SECRET-EXIF-COPYRIGHT", Artist: "Factory Owner" } })
    .toFile(`${D}/photo.jpg`);
  await grad(800, 600, "#FF7A00").png().toFile(`${D}/photo2.png`);
  await grad(1200, 800, "#1B4D3E").webp().toFile(`${D}/photo3.webp`);
  await grad(900, 900, "#E86A00").jpeg().toFile(`${D}/logo.jpg`);
  await grad(1920, 700, "#2F7D5C").jpeg().toFile(`${D}/slide.jpg`);
  await grad(300, 300, "#222222").jpeg().toFile(`${D}/cat.jpg`);
  fs.writeFileSync(`${D}/evil.svg`, `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
  const ftyp = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp" + brand), Buffer.from([0, 0, 0, 0]), Buffer.from("isommp41")]);
  fs.writeFileSync(`${D}/fake.heic`, Buffer.concat([ftyp("heic"), Buffer.alloc(5000, 1)]));
  fs.writeFileSync(`${D}/clip.mov`, Buffer.concat([ftyp("qt  "), Buffer.alloc(5000, 1)]));
  fs.writeFileSync(`${D}/clip.mp4`, Buffer.concat([ftyp("isom"), Buffer.alloc(300 * 1024, 7)]));
  fs.writeFileSync(`${D}/big.mp4`, Buffer.concat([ftyp("isom"), Buffer.alloc(21 * 1024 * 1024, 7)]));
  fs.writeFileSync(`${D}/big.jpg`, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16 * 1024 * 1024, 3)]));
  fs.writeFileSync(`${D}/corrupt.jpg`, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 9)]));
  return { dir: D, cleanup: () => fs.rmSync(D, { recursive: true, force: true }) };
}
