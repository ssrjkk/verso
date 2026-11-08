"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
        className="rounded-lg border px-3 py-1.5 text-sm opacity-60"
      >
        Тема: …
      </button>
    );
  }
  const dark = (resolvedTheme ?? theme) === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="rounded-lg border px-3 py-1.5 text-sm"
    >
      Тема: {dark ? "тёмная" : "светлая"}
    </button>
  );
}
