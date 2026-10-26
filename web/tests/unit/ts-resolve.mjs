// قلاب کوچک برای اجرای مستقیم فایل‌های TypeScript پروژه در تست واحد (node --experimental-strip-types):
// importهای نسبی پروژه پسوند ندارند ("./normalize")؛ این قلاب «.ts» را اضافه می‌کند. فقط برای تست؛ در build استفاده نمی‌شود.
// اجرا: node --experimental-strip-types --import ./tests/unit/ts-resolve.mjs tests/unit/<file>.test.mjs
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + ".ts", context);
    throw e;
  }
}`),
);
