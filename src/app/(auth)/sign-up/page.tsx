"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
            const res = await signUp.email({ name, email, password });
            if (res.error) {
              setErr(res.error.message ?? "Ошибка регистрации");
            } else {
              router.push("/dashboard");
              router.refresh();
            }
          } catch {
            setErr("Ошибка регистрации");
          } finally {
            setLoading(false);
          }
        }}
      >
        <h1 className="font-display text-2xl font-extrabold text-white">
          Регистрация · <span className="text-[#f97316]">Verso</span>
        </h1>
        <p className="text-sm text-neutral-400">Создайте аккаунт для работы с контентом</p>
        <label htmlFor="signup-name" className="text-xs font-semibold text-neutral-300">
          Имя
        </label>
        <input
          id="signup-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="имя"
          type="text"
          autoComplete="name"
          required
          aria-invalid={err ? true : undefined}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-[#f97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        />
        <label htmlFor="signup-email" className="text-xs font-semibold text-neutral-300">
          Email
        </label>
        <input
          id="signup-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={err ? true : undefined}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-[#f97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        />
        <label htmlFor="signup-password" className="text-xs font-semibold text-neutral-300">
          Пароль
        </label>
        <input
          id="signup-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="пароль (мин. 8 символов)"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={err ? true : undefined}
          aria-describedby="signup-password-hint"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-[#f97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        />
        <p id="signup-password-hint" className="sr-only">
          Пароль должен содержать минимум 8 символов
        </p>
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
        <button
          disabled={loading}
          aria-label={loading ? "Создаём аккаунт" : "Создать аккаунт"}
          className="rounded-xl bg-[#c2410c] py-2.5 font-semibold text-white transition hover:bg-[#9a3412] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12121a]"
        >
          {loading ? "Создаём…" : "Создать аккаунт"}
        </button>
        <p className="text-center text-sm text-neutral-400">
          Уже есть аккаунт?{" "}
          <Link href="/sign-in" className="font-semibold text-[#f97316] hover:underline">
            Войти
          </Link>
        </p>
      </form>
    </main>
  );
}
