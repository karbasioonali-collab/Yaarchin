# اکستنشن کروم یارچین — نسخه‌ی صفر (0.1.0)

ثبت دستی صفحه‌های `alibaba.com` روی همین کامپیوتر. **بدون سرور:** هیچ صفحه‌ای خودکار باز نمی‌شود و هیچ داده‌ای به بیرون فرستاده نمی‌شود.

## چه کار می‌کند
- پایین-چپ همه‌ی صفحه‌های `alibaba.com` یک دکمه‌ی سبز «ثبت این صفحه» می‌گذارد.
- با کلیک، یک کادر کوچک برای «اسم محصول/گروه» باز می‌شود. آخرین اسمی که نوشته‌اید یادش می‌ماند. بعد «ثبت» یا Enter را بزنید.
- موارد ذخیره‌شده: URL، عنوان، زمان، HTML کامل، متن قابل‌مشاهده، لینک همه‌ی عکس‌ها و ویدیوها، اسم گروه.
- ذخیره در IndexedDB خود اکستنشن انجام می‌شود و با مجوز `unlimitedStorage` محدودیت ۱۰ مگابایت ندارد.
- **صفحه‌ی لیست:** با کلیک روی آیکون یارچین در نوار ابزار کروم (یا دکمه‌ی «لیست» در کادر) باز می‌شود. دکمه‌ی «حذف» برای هر مورد، و دکمه‌ی «خروجی JSON» که همه را در `Downloads/yarchin/yarchin-export-<زمان>.json` ذخیره می‌کند.

## نصب (Developer mode)
1. کد را بگیرید. یکی از این دو راه:
   - **دانلود ZIP از گیت‌هاب:** در صفحه‌ی ریپو، برنچ درست را انتخاب کنید و بعد **Code ← Download ZIP** را بزنید. ZIP را از حالت فشرده خارج کنید.
   - یا با git: `git clone` و بعد `git checkout <branch>`.
2. در کروم به آدرس `chrome://extensions` بروید.
3. **Developer mode** را (بالا-راست) روشن کنید.
4. **Load unpacked** را بزنید و پوشه‌ی `extension/` را انتخاب کنید (همان پوشه‌ای که `manifest.json` داخلش است، نه ریشه‌ی ریپو).
5. آیکون یارچین را در منوی پازل کروم پین کنید.

## به‌روزرسانی
ZIP جدید را بگیرید و جایگزین پوشه‌ی قبلی کنید. در `chrome://extensions` دکمه‌ی ↻ اکستنشن را بزنید و **صفحه‌های باز علی‌بابا را رفرش کنید**.
داده‌های ثبت‌شده با reload پاک نمی‌شوند. فقط با **Remove** کردن اکستنشن پاک می‌شوند، پس قبل از Remove حتماً خروجی JSON بگیرید.

## ساختار کد
```
extension/
  manifest.json              Manifest V3
  assets/fonts/              وزیرمتن (Variable، آفلاین) + مجوز OFL
  assets/icons/              آیکون‌های موقت
  src/shared/config.js       ثابت‌ها: نام دیتابیس، پیام‌ها، سوئیچ ارسال به سرور (خاموش)
  src/shared/db.js           لایه‌ی ذخیره (IndexedDB): captures (سبک) + bodies (HTML و متن)
  src/shared/transport.js    لایه‌ی ارسال به سرور (فعلاً خاموش؛ مرحله‌ی ۸)
  src/background/service-worker.js   دریافت ثبت، ساخت رکورد، ذخیره
  src/content/capture.js     جمع‌آوری داده‌ی خام صفحه («بی‌مغز»)
  src/content/ui.js          دکمه و کادر (Shadow DOM)
  src/pages/list.*           صفحه‌ی لیست، حذف، خروجی JSON
  src/ui/theme.css           رنگ‌ها و فونت مشترک
```

جای افزودن قابلیت‌های بعدی:
- **ارسال به سرور:** `transport.js` و `SERVER_SYNC_ENABLED`. ستون `syncStatus` در هر رکورد از الان هست.
- **کشوی دسته‌بندی:** جایگزین فیلد اسم گروه در `ui.js`. در رکورد یک فیلد `categoryId` اضافه می‌شود و `schemaVersion` بالا می‌رود.
- **ثبت خودکار:** یک ماژول صف در service worker که `collectPage` را صدا بزند. ستون `source` از الان `manual` یا `auto` است.

## فرمت خروجی JSON
```json
{
  "format": "yarchin-captures",
  "schemaVersion": 1,
  "exportedAt": "…",
  "count": 1,
  "captures": [
    {
      "id": "uuid", "schemaVersion": 1, "source": "manual",
      "url": "…", "title": "…", "groupName": "…", "capturedAt": "ISO",
      "pageLang": "en", "images": ["…"], "videos": ["…"],
      "htmlBytes": 0, "textLength": 0, "syncStatus": "local",
      "html": "…", "visibleText": "…"
    }
  ]
}
```

فایل‌های خروجی داده‌ی واقعی هستند. **در ریپو قرار ندهید.** اگر لازم شد، در `samples/` بگذارید؛ این پوشه در `.gitignore` است.
