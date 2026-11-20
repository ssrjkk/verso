"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { signIn } from "@/lib/auth-client";
import { demoCredentials } from "@/lib/demo-access";
import { safeInternalPath } from "@/lib/safe-redirect";

const inputClass =
  "w-full rounded-sm border border-ink-950/20 bg-paper-raised px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/15 dark:bg-white/5 dark:placeholder:text-stone-500 dark:focus:border-accent-soft dark:focus-visible:ring-accent-soft";

function nextTarget(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"));
}

export default function SignInPage() {
  const router = useRouter();
  const demo = demoCredentials();
  const [email, setEmail] = useState(() => demo.email);
  const [password, setPassword] = useState(() => demo.password);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell
      title="Вход в редакцию"
      subtitle="Войдите, чтобы управлять коллекциями, медиатекой и публикациями."
      footer={
        <>
          Нет аккаунта?{" "}
          <Link
            href="/sign-up"
            className="font-semibold text-accent-ink hover:underline dark:text-accent-soft"
          >
            Регистрация
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setLoading(true);
          try {
            const res = await signIn.email({ email, password });
            if (res.error) {
              setErr(res.error.message ?? "Ошибка входа");
            } else {
              // proxy кладёт исходный путь в ?next=; открытый редирект отсекаем.
              router.push(nextTarget());
              router.refresh();
            }
          } catch {
            setErr("Ошибка входа");
          } finally {
            setLoading(false);
          }
        }}
      >
        <label
          htmlFor="signin-email"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-300"
        >
          Email
        </label>
        <input
          id="signin-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.ru"
          type="email"
          autoComplete="email"
          required
          aria-invalid={err ? true : undefined}
          className={inputClass}
        />
        <label
          htmlFor="signin-password"
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-300"
        >
          Пароль
        </label>
        <input
          id="signin-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="пароль"
          autoComplete="current-password"
          required
          aria-invalid={err ? true : undefined}
          className={inputClass}
        />
        {err && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}
        <button
          disabled={loading}
          aria-label={loading ? "Выполняется вход" : "Войти"}
          className="mt-2 w-full rounded-sm bg-accent-strong py-2.5 font-semibold text-white transition-colors hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 dark:focus-visible:ring-accent-soft"
        >
          {loading ? "Входим…" : "Войти"}
        </button>
        {demo.email && (
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
            Dev: подставлен демо-доступ {demo.email}
          </p>
        )}
      </form>
    </AuthShell>
  );
}
