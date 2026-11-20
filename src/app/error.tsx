"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Логируем в консоль браузера для диагностики; в проде здесь можно
    // подключить внешний репортер (Sentry/OTel), не меняя контракт.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 p-6 text-center text-stone-100">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Ошибка</p>
      <h1 className="font-display text-3xl font-extrabold">Что-то пошло не так</h1>
      <p className="max-w-md text-sm text-stone-400">
        Попробуйте ещё раз. Если ошибка повторяется — обновите страницу.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-sm bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-deep focus-visible:outline-none"
        >
          Повторить
        </button>
        <Link
          href="/"
          className="rounded-sm border border-white/15 px-5 py-2.5 text-sm font-semibold text-stone-100 transition hover:border-white/30 focus-visible:outline-none"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
