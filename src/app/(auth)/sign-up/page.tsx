"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { signUp } from "@/lib/auth-client";

const inputClass =
  "w-full rounded-sm border border-ink-950/20 bg-paper-raised px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/15 dark:bg-white/5 dark:placeholder:text-stone-500 dark:focus:border-accent-soft dark:focus-visible:ring-accent-soft";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <AuthShell
      title="Регистрация"
      subtitle="Создайте аккаунт. Первый пользователь пустой установки становится администратором."
      footer={
        <>
          Уже есть аккаунт?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-accent-ink hover:underline dark:text-accent-soft"
          >
            Войти
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
        <label
          htmlFor="signup-name"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-300"
        >
          Имя
        </label>
        <input
          id="signup-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Как к вам обращаться"
          type="text"
          autoComplete="name"
          required
          aria-invalid={err ? true : undefined}
          className={inputClass}
        />
        <label
          htmlFor="signup-email"
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-300"
        >
          Email
        </label>
        <input
          id="signup-email"
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
          htmlFor="signup-password"
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-300"
        >
          Пароль
        </label>
        <input
          id="signup-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="минимум 8 символов"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={err ? true : undefined}
          aria-describedby="signup-password-hint"
          className={inputClass}
        />
        <p
          id="signup-password-hint"
          className="font-mono text-[9px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400"
        >
          Минимум 8 символов
        </p>
        {err && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {err}
          </p>
        )}
        <button
          disabled={loading}
          aria-label={loading ? "Создаём аккаунт" : "Создать аккаунт"}
          className="mt-2 w-full rounded-sm bg-accent-strong py-2.5 font-semibold text-white transition-colors hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 dark:focus-visible:ring-accent-soft"
        >
          {loading ? "Создаём…" : "Создать аккаунт"}
        </button>
      </form>
    </AuthShell>
  );
}
