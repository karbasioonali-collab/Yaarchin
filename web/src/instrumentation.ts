// یک بار هنگام بالا آمدن سرور Next اجرا می‌شود (نه در build). فقط در runtime نود: زمان‌بند یادآوری پیامکی گفتگوها.
// docs/infoyaarchin.md بخش ۲۵.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startChatScheduler } = await import("./lib/chat/scheduler");
  startChatScheduler();
}
