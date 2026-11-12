"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { demoCredentials } from "@/lib/demo-access";
import { safeInternalPath } from "@/lib/safe-redirect";

function nextTarget(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"));
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState(() => demoCredentials().email);
  const [password, setPassword] = useState(() => demoCredentials().password);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="grid min-h-screen place-items-center bg-[#12121a] p-6">
      <form
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/50 backdrop-blur flex flex-col gap-3"
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
        <h1 className="font-display text-2xl font-extrabold text-white">
          Вход · <span className="text-[#f97316]">Verso</span>
        </h1>
        <p className="text-sm text-neutral-400">Войдите, чтобы управлять контентом</p>
        <label htmlFor="signin-email" className="text-xs font-semibold text-neutral-300">
          Email
        </label>
        <input
          id="signin-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={err ? true : undefined}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-[#f97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        />
        <label htmlFor="signin-password" className="text-xs font-semibold text-neutral-300">
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
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-[#f97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        />
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
        <button
          disabled={loading}
          aria-label={loading ? "Выполняется вход" : "Войти"}
          className="rounded-xl bg-[#c2410c] py-2.5 font-semibold text-white transition hover:bg-[#9a3412] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        >
          {loading ? "Входим…" : "Войти"}
        </button>
        <p className="text-center text-sm text-neutral-400">
          Нет аккаунта?{" "}
          <Link href="/sign-up" className="font-semibold text-[#f97316] hover:underline">
            Регистрация
          </Link>
        </p>
      </form>
    </main>
  );
}
