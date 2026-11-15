"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
      )}
    </svg>
  );
}

export function ThemeToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // Подписки нет: значение меняется только на границе сервер/клиент.
  // useSyncExternalStore даёт false на сервере и true после гидратации
  // без setState в эффекте (и без лишнего кадра).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const label = "Переключить тему";
  // До монтирования рендерим детерминированный плейсхолдер:
  // theme на сервере и первом клиентском рендере расходится (undefined -> dark),
  // что давало hydration mismatch React #418.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label={label}
        disabled
        className={cn(
          compact
            ? "grid size-9 place-items-center rounded-full border opacity-60"
            : "rounded-lg border px-3 py-1.5 text-sm opacity-60",
          className,
        )}
      >
        {compact ? <span aria-hidden="true">◐</span> : "Тема: …"}
      </button>
    );
  }
  const dark = (resolvedTheme ?? theme) === "dark";
  const content: ReactNode = compact ? <ThemeIcon dark={dark} /> : `Тема: ${dark ? "тёмная" : "светлая"}`;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={compact ? label : undefined}
      className={cn(
        compact
          ? "grid size-9 place-items-center rounded-full border transition hover:border-[#f97316]/60 hover:text-[#9a3412] dark:hover:text-[#fb923c]"
          : "rounded-lg border px-3 py-1.5 text-sm",
        className,
      )}
    >
      {content}
    </button>
  );
}
