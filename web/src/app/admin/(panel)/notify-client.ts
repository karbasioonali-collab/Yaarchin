"use client";

// روشن/خاموش «اعلان و صدای گفتگو» در این مرورگر (localStorage) و پخش صدا. مشترک بین دکمه‌ی منو (PanelPulse)
// و نوار بالای صفحه‌ی «گفتگوها» (NotifyBanner) تا هر دو همیشه یک وضعیت نشان دهند (رویداد yc:notify).
const KEY = "yc_notify";

let audio: AudioContext | null = null;
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* مرورگر قدیمی */
  }
}
export function beep() {
  if (!audio || audio.state !== "running") return;
  const t = audio.currentTime;
  for (const [i, f] of [880, 1320].entries()) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.16);
    g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.15);
    o.connect(g).connect(audio.destination);
    o.start(t + i * 0.16);
    o.stop(t + i * 0.16 + 0.16);
  }
}

// روشن/خاموش اعلان در localStorage همین مرورگر؛ با useSyncExternalStore تا رندر سرور (خاموش) و مرورگر با هم بخوانند
export const notifyEnabled = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
export const subscribeNotify = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("yc:notify", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("yc:notify", cb);
  };
};

// روشن کردن: صدا آزاد می‌شود و اگر هنوز نپرسیده‌ایم، اجازه‌ی اعلان مرورگر خواسته می‌شود (فقط با کلیک کاربر ممکن است)
export async function setNotify(next: boolean): Promise<void> {
  if (next) {
    unlockAudio();
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    beep();
  }
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* حالت خصوصی */
  }
  window.dispatchEvent(new Event("yc:notify"));
}
