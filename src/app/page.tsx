import Link from "next/link";

const MODULES = [
  {
    glyph: "◧",
    title: "Конструктор страниц",
    text: "Блочный Page Builder: секции, ревизии и предпросмотр без кода.",
  },
  {
    glyph: "▦",
    title: "Коллекции",
    text: "Гибкие типы контента, поля и связи. Структура под любой проект.",
  },
  {
    glyph: "◉",
    title: "Медиатека",
    text: "Файлы, папки и быстрый поиск. Всё для контента в одном месте.",
  },
  {
    glyph: "⬡",
    title: "SEO-инспектор",
    text: "Мета-теги, Open Graph и проверки перед публикацией.",
  },
  {
    glyph: "✦",
    title: "Headless API",
    text: "tRPC и REST-доступ к контенту для сайта, приложения и витрины.",
  },
  {
    glyph: "⌘",
    title: "CRM-связка",
    text: "Единая ink-система Corvid: контент и сделки говорят на одном языке.",
  },
];

const STACK = ["Next.js 16", "React 19", "tRPC v11", "Prisma 7", "Better Auth", "Tailwind v4"];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f4f3fa] text-neutral-900 dark:bg-ink-950 dark:text-neutral-100">
      {/* Hero */}
      <header className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-10 pt-16 text-center sm:pt-24">
        <p className="rounded-full border border-[#7c5cff]/30 bg-[#7c5cff]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#6440f2] dark:text-[#9d85ff]">
          Next.js 16 · Headless CMS · Page Builder
        </p>
        <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Corvid <span className="text-[#7c5cff]">CMS</span> — контент,
          <br className="hidden sm:block" /> который удобно издавать
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-lg">
          Коллекции, ревизии, медиатека, SEO-инспектор, Headless API и канбан редполитики —
          в фирменной «чернильной» дизайн-системе Corvid.
        </p>
        <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-xl bg-[#7c5cff] px-6 py-3 font-semibold text-white transition hover:bg-[#6440f2] focus-visible:outline-none"
          >
            Открыть дашборд
          </Link>
          <Link
            href="/sign-in"
            className="rounded-xl border border-black/15 px-6 py-3 font-semibold transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* Modules */}
      <main className="mx-auto w-full max-w-6xl px-6 pb-10">
        <section aria-labelledby="modules-heading">
          <h2 id="modules-heading" className="font-display text-xl font-extrabold sm:text-2xl">
            Шесть модулей из коробки
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Всё нужное редакции, разработчику и маркетологу — без плагинов-костылей.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
            {MODULES.map((m) => (
              <li
                key={m.title}
                className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-ink-900"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 place-items-center rounded-xl bg-[#7c5cff]/15 text-lg text-[#7c5cff] dark:text-[#9d85ff]"
                >
                  {m.glyph}
                </span>
                <h3 className="mt-3 font-display text-base font-bold">{m.title}</h3>
                <p className="line-clamp-2 mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {m.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Stack */}
        <section aria-label="Технологический стек" className="mt-10">
          <ul className="flex flex-wrap items-center justify-center gap-2" role="list">
            {STACK.map((s) => (
              <li
                key={s}
                className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-black/10 py-5 dark:border-white/10">
        <p className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-xs text-neutral-500 dark:text-neutral-500">
          <span>
            Corvid <span className="text-[#7c5cff]">CMS</span> · ink-система Corvid
          </span>
          <span>tRPC · Prisma · Better Auth · Tailwind v4</span>
        </p>
      </footer>
    </div>
  );
}
