import "server-only";
// نوشتن و پاک کردن فایل در storage: فضای ابری لیارا (سازگار با S3، با aws4fetch) یا دیسک برنامه (حالت آزمایشی).
// docs/infoyaarchin.md بخش ۲۶.
import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { s3Config, type S3Config } from "@/lib/storage";

export function localDir(): string {
  return path.resolve(process.env.MEDIA_LOCAL_DIR?.trim() || path.join(process.cwd(), ".data", "media"));
}

// مسیر امن روی دیسک (کلیدها فقط [a-z0-9/.-] هستند؛ این چک جلوی هر «..» را هم می‌گیرد)
function localPath(file: string): string {
  if (!/^[a-z0-9][a-z0-9/._-]*$/.test(file) || file.includes("..")) throw new Error("bad storage key");
  return path.join(localDir(), file);
}

let client: { cfg: S3Config; aws: AwsClient } | null = null;
function s3(cfg: S3Config) {
  if (!client || client.cfg !== cfg) client = { cfg, aws: new AwsClient({ accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey, service: "s3", region: cfg.region }) };
  return client.aws;
}
const objectUrl = (cfg: S3Config, file: string) => `${cfg.endpoint}/${cfg.bucket}/${file}`;

export async function putFile(file: string, body: Buffer, contentType: string): Promise<void> {
  const cfg = s3Config();
  if (cfg) {
    const r = await s3(cfg).fetch(objectUrl(cfg, file), {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!r.ok) throw new Error(`storage PUT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const p = localPath(file);
  await mkdir(path.dirname(p), { recursive: true });
  // اول فایل موقت، بعد rename: فایل نیمه‌نوشته هرگز سرو نمی‌شود
  const tmp = `${p}.${process.pid}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, p);
}

export async function deleteFile(file: string): Promise<void> {
  const cfg = s3Config();
  if (cfg) {
    const r = await s3(cfg).fetch(objectUrl(cfg, file), { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`storage DELETE ${r.status}`);
    return;
  }
  await unlink(localPath(file)).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}

// حالت آزمایشی: حجم فعلی فایل‌ها و فضای آزاد دیسک (بایت)
export async function localUsage(): Promise<number> {
  async function walk(dir: string): Promise<number> {
    const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
    let n = 0;
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) n += await walk(p);
      else if (it.isFile()) n += (await stat(p)).size;
    }
    return n;
  }
  return walk(localDir());
}

export async function localFree(): Promise<number | null> {
  try {
    await mkdir(localDir(), { recursive: true });
    const s = await statfs(localDir());
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

// خواندن فایل حالت آزمایشی برای /files/… (با پشتیبانی Range برای ویدیو؛ Safari بدون آن ویدیو پخش نمی‌کند)
export async function openLocal(file: string, range?: { start: number; end?: number }) {
  const p = localPath(file);
  const st = await stat(p).catch(() => null);
  if (!st?.isFile()) return null;
  const end = range ? Math.min(range.end ?? st.size - 1, st.size - 1) : st.size - 1;
  const start = range ? range.start : 0;
  if (start > end) return { size: st.size, start, end, stream: null };
  return { size: st.size, start, end, stream: createReadStream(p, { start, end }) };
}
