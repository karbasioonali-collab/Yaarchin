"use client";

import { startTransition, type FormEvent } from "react";

// React 19 بعد از هر action فیلدهای فرم را خالی می‌کند؛ با این روش مقدارها (مثلاً موبایل بعد از رمز اشتباه) می‌مانند.
export function submitWithoutReset(dispatch: (fd: FormData) => void, confirmText?: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
}
