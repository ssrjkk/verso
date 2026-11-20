import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper text-ink-950 dark:bg-ink-950 dark:text-[#f2ede2] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden border-r border-ink-950/10 p-10 dark:border-white/10 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="landing-grid absolute inset-0" />
        <Link
          href="/"
          className="relative inline-flex items-center gap-2.5"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-[2px] bg-accent-strong font-mono text-xs font-semibold text-white"
          >
            V
          </span>
          <span className="font-display text-xl font-bold tracking-[-0.02em]">Verso</span>
        </Link>

        <div className="relative max-w-lg">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-ink dark:text-accent-soft">
            Редакционная Headless CMS
          </p>
          <p className="mt-5 font-display text-4xl font-bold leading-[1.04] tracking-[-0.035em]">
            Контент с редактурой, а не CRUD.
          </p>
          <p className="mt-5 text-base leading-relaxed text-stone-600 dark:text-stone-300">
            Коллекции с настраиваемыми полями, блочный конструктор и редполитика
            в одном self-hosted приложении.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-ink-950/15 pt-5 dark:border-white/15">
            {[
              { value: "8", label: "шаблонов" },
              { value: "8", label: "типов полей" },
              { value: "MIT", label: "лицензия" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col-reverse gap-1">
                <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400">
                  {item.label}
                </dt>
                <dd className="font-display text-2xl font-bold leading-none">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
          SQLite WAL · без внешней очереди · self-hosted
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5"
            >
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-[2px] bg-accent-strong font-mono text-xs font-semibold text-white"
              >
                V
              </span>
              <span className="font-display text-xl font-bold tracking-[-0.02em]">Verso</span>
            </Link>
          </div>

          <h1 className="font-display text-3xl font-bold tracking-[-0.03em]">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            {subtitle}
          </p>

          <div className="mt-6">{children}</div>

          <div className="mt-6 text-sm text-stone-600 dark:text-stone-400">{footer}</div>

          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft"
          >
            <span aria-hidden="true">←</span> На главную
          </Link>
        </div>
      </section>
    </main>
  );
}
