import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Редакционная Headless CMS и конструктор страниц",
  description:
    "Verso — self-hosted редакционная CMS: коллекции, блочный конструктор, редполитика, медиатека, SEO и Headless API. Next.js 16, tRPC, Prisma и SQLite.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Verso",
    title: "Verso — редакционная Headless CMS",
    description:
      "Контент, который удобно издавать: коллекции, конструктор страниц, редполитика, медиатека, SEO и API в одном self-hosted приложении.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Verso — редакционная Headless CMS",
    description:
      "Контент, который удобно издавать: коллекции, конструктор страниц, редполитика, медиатека, SEO и API.",
  },
};

const NAV_LINKS = [
  { href: "#modules", label: "Возможности" },
  { href: "#workflow", label: "Процесс" },
  { href: "#api", label: "API" },
  { href: "#principles", label: "Принципы" },
];

type ModuleIcon = "builder" | "collections" | "media" | "seo" | "api" | "webhooks";

const MODULES: Array<{
  title: string;
  icon: ModuleIcon;
  text: string;
  points: string[];
  span: string;
  visual?: "builder" | "collections";
}> = [
  {
    title: "Конструктор страниц",
    icon: "builder",
    text: "Блочный Page Builder: секции, ревизии и предпросмотр без кода.",
    points: ["HERO · TEXT · MEDIA · CTA", "порядок и видимость блоков", "предпросмотр до публикации"],
    span: "sm:col-span-2",
    visual: "builder",
  },
  {
    title: "Коллекции",
    icon: "collections",
    text: "Гибкие типы контента, поля и связи. Структура под любой проект.",
    points: ["схемы и связи", "CSV-импорт и экспорт", "фильтры по статусам"],
    span: "sm:col-span-2",
    visual: "collections",
  },
  {
    title: "Медиатека",
    icon: "media",
    text: "Файлы, alt-тексты и поиск. Всё для контента в одном месте.",
    points: ["magic bytes и лимиты", "поиск по alt", "безопасные имена"],
    span: "",
  },
  {
    title: "SEO-инспектор",
    icon: "seo",
    text: "Мета-теги, Open Graph и проверки перед публикацией.",
    points: ["title и description", "OG-превью", "sitemap и robots"],
    span: "",
  },
  {
    title: "Headless API",
    icon: "api",
    text: "tRPC и REST-доступ к контенту для сайта, приложения и витрины.",
    points: ["scoped API-ключи", "rate limit 429", "публикация через POST"],
    span: "",
  },
  {
    title: "Вебхуки и ревизии",
    icon: "webhooks",
    text: "События публикации для ревалидации и история версий с откатом.",
    points: ["транзакционный outbox", "HMAC-подпись", "откат к любой ревизии"],
    span: "",
  },
];

const METRICS = [
  { value: "6", label: "модулей редакции" },
  { value: "80+", label: "e2e-проверок в CI" },
  { value: "at-least-once", label: "доставка вебхуков" },
  { value: "SQLite", label: "self-hosted, без внешней БД" },
];

const STEPS = [
  {
    tag: "DRAFT",
    title: "Черновик",
    text: "Коллекция, блоки и медиа собираются в одном редакторе.",
  },
  {
    tag: "IN_REVIEW",
    title: "Ревью",
    text: "Канбан и календарь показывают, что ждёт редактора и фактчека.",
  },
  {
    tag: "PUBLISHED",
    title: "Публикация",
    text: "Сразу или по расписанию; событие уходит в outbox в той же транзакции.",
  },
  {
    tag: "REVISIONS",
    title: "История",
    text: "Каждая версия сохранена: сравните и откатитесь без потери данных.",
  },
];

const API_POINTS = [
  "Чтение и запись по scope ключа",
  "Ключи хранятся только хешами",
  "429 с Retry-After на флуд",
  "Вебхуки с HMAC-SHA256",
];

const PRINCIPLES: Array<{
  icon: "database" | "shield" | "accessibility" | "book";
  title: string;
  text: string;
}> = [
  {
    icon: "database",
    title: "Данные у вас",
    text: "SQLite в режиме WAL, Prisma-миграции и backup без внешней БД.",
  },
  {
    icon: "shield",
    title: "Безопасность по умолчанию",
    text: "SSRF-защита вебхуков, RBAC, scoped API-ключи и rate limit.",
  },
  {
    icon: "accessibility",
    title: "Доступность как тест",
    text: "axe, контраст AA, клавиатура и reduced motion — в общих воротах.",
  },
  {
    icon: "book",
    title: "Решения зафиксированы",
    text: "ADR в docs/DECISIONS.md; контракты держат тесты, а не обещания.",
  },
];

const STACK = ["Next.js 16", "React 19", "tRPC v11", "Prisma 7", "Better Auth", "Tailwind v4"];

const BOARD_COLUMNS = [
  {
    title: "Черновик",
    dot: "bg-neutral-400",
    cards: [
      { title: "Как выбрать тему", meta: "TEXT · 4 блока" },
      { title: "Гид по осени", meta: "HERO · MEDIA" },
    ],
  },
  {
    title: "На ревью",
    dot: "bg-amber-500",
    cards: [{ title: "Манифест редакции", meta: "фактчек" }],
  },
  {
    title: "Опубликовано",
    dot: "bg-emerald-500",
    cards: [{ title: "Письмо читателям", meta: "v3 · 12 ноя" }],
  },
];

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Verso",
  applicationCategory: "ContentManagementSystem",
  operatingSystem: "Web",
  description:
    "Self-hosted редакционная Headless CMS с блочным конструктором страниц, коллекциями, ревизиями, медиатекой, SEO-инспектором и API.",
  isAccessibleForFree: true,
  license: "https://opensource.org/licenses/MIT",
  featureList: MODULES.map((module) => module.title),
};

function LineIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-5"}
    >
      {children}
    </svg>
  );
}

function FeatureIcon({ name }: { name: ModuleIcon }) {
  switch (name) {
    case "builder":
      return (
        <LineIcon>
          <rect x="3" y="3" width="18" height="5" rx="1.5" />
          <rect x="3" y="11" width="8" height="10" rx="1.5" />
          <rect x="14" y="11" width="7" height="10" rx="1.5" />
        </LineIcon>
      );
    case "collections":
      return (
        <LineIcon>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </LineIcon>
      );
    case "media":
      return (
        <LineIcon>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="m21 15-4.2-4.2L7 21" />
        </LineIcon>
      );
    case "seo":
      return (
        <LineIcon>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
          <path d="m8 11 2 2 4-4" />
        </LineIcon>
      );
    case "api":
      return (
        <LineIcon>
          <path d="m8 4-5 8 5 8" />
          <path d="m16 4 5 8-5 8" />
          <path d="m14 4-4 16" />
        </LineIcon>
      );
    case "webhooks":
      return (
        <LineIcon>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </LineIcon>
      );
  }
}

function PrincipleIcon({ name }: { name: (typeof PRINCIPLES)[number]["icon"] }) {
  switch (name) {
    case "database":
      return (
        <LineIcon>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </LineIcon>
      );
    case "shield":
      return (
        <LineIcon>
          <path d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </LineIcon>
      );
    case "accessibility":
      return (
        <LineIcon>
          <circle cx="12" cy="4" r="2" />
          <path d="M4 8h16M12 8v6m0 0-4 7m4-7 4 7" />
        </LineIcon>
      );
    case "book":
      return (
        <LineIcon>
          <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5Z" />
          <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5Z" />
        </LineIcon>
      );
  }
}

function CheckIcon() {
  return (
    <LineIcon className="mt-0.5 size-3.5 shrink-0 text-[#c2410c] dark:text-[#fb923c]">
      <path d="m5 12 4 4L19 6" />
    </LineIcon>
  );
}

function SectionIntro({
  eyebrow,
  title,
  text,
  headingId,
}: {
  eyebrow: string;
  title: string;
  text: string;
  headingId: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9a3412] dark:text-[#fb923c]">
        {eyebrow}
      </p>
      <h2
        id={headingId}
        className="mt-3 font-display text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl"
      >
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-base">
        {text}
      </p>
    </div>
  );
}

function BuilderVisual() {
  return (
    <div className="mt-5 space-y-1.5" aria-hidden="true">
      {["HERO", "TEXT", "MEDIA"].map((label, index) => (
        <div
          key={label}
          className="flex items-center gap-2 rounded-lg border border-dashed border-black/10 bg-[#f7f4ee]/80 px-2.5 py-1.5 dark:border-white/15 dark:bg-ink-950/40"
        >
          <span className="grid size-4 place-items-center rounded bg-[#f97316]/15 text-[7px] font-bold text-[#9a3412] dark:text-[#fb923c]">
            {index + 1}
          </span>
          <span className="text-[9px] font-semibold tracking-[0.12em] text-neutral-600 dark:text-neutral-300">
            {label}
          </span>
          <span className="ml-auto flex gap-0.5">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-0.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CollectionsVisual() {
  return (
    <div className="mt-5" aria-hidden="true">
      <div className="flex flex-wrap gap-1.5">
        {["posts", "authors", "tags", "projects"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-black/10 bg-[#f7f4ee]/80 px-2 py-1 font-mono text-[9px] text-neutral-600 dark:border-white/15 dark:bg-ink-950/40 dark:text-neutral-300"
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-2.5 space-y-1 rounded-lg border border-black/10 bg-[#f7f4ee]/80 p-2.5 font-mono text-[9px] dark:border-white/15 dark:bg-ink-950/40">
        {[
          ["title", "String"],
          ["status", "Enum"],
          ["publishedAt", "DateTime"],
        ].map(([field, type]) => (
          <div key={field} className="flex items-center justify-between gap-2">
            <span className="text-neutral-700 dark:text-neutral-300">{field}</span>
            <span className="text-neutral-600 dark:text-neutral-400">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#f97316]/20 via-transparent to-[#c2410c]/10 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="landing-float relative overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-ink-900 dark:shadow-black/40"
      >
        <div className="flex items-center gap-2 border-b border-black/5 bg-[#faf8f4] px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-[#f97316]/70" />
            <span className="size-2 rounded-full bg-amber-400/80" />
            <span className="size-2 rounded-full bg-emerald-500/80" />
          </span>
          <span className="ml-2 truncate rounded-md border border-black/5 bg-white px-2 py-0.5 text-[9px] text-neutral-500 dark:border-white/10 dark:bg-ink-950/60 dark:text-neutral-400">
            cms.verso.local/board
          </span>
          <span className="ml-auto rounded-md bg-[#f97316]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#9a3412] dark:text-[#fb923c]">
            v12
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[108px_1fr]">
          <div className="hidden flex-col gap-1 border-r border-black/5 p-3 sm:flex dark:border-white/10">
            <span className="mb-2 grid size-6 place-items-center rounded-lg bg-[#c2410c] font-display text-[10px] font-extrabold text-white">
              V
            </span>
            <span className="rounded-md bg-[#f97316]/10 px-2 py-1 text-[8px] font-semibold text-[#9a3412] dark:text-[#fb923c]">
              Редполитика
            </span>
            {["Обзор", "Записи", "Медиа", "SEO", "API"].map((item) => (
              <span key={item} className="px-2 py-1 text-[8px] text-neutral-600 dark:text-neutral-400">
                {item}
              </span>
            ))}
          </div>

          <div className="min-w-0 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[7px] font-semibold uppercase tracking-[0.16em] text-neutral-600 dark:text-neutral-400">
                  Редакция
                </p>
                <p className="font-display text-xs font-bold sm:text-sm">Осенний выпуск</p>
              </div>
              <span className="rounded-md bg-[#f97316]/10 px-2 py-1 text-[8px] font-semibold text-[#9a3412] dark:text-[#fb923c]">
                3 в работе
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {BOARD_COLUMNS.map((column) => (
                <div key={column.title} className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-[7px] font-semibold text-neutral-600 dark:text-neutral-400">
                    <span className={cn("size-1 rounded-full", column.dot)} />
                    {column.title}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {column.cards.map((card) => (
                      <div
                        key={card.title}
                        className="rounded-md border border-black/5 bg-[#faf8f4] p-1.5 shadow-sm dark:border-white/10 dark:bg-white/5"
                      >
                        <p className="text-[7px] font-semibold leading-tight text-neutral-800 dark:text-neutral-200">
                          {card.title}
                        </p>
                        <p className="mt-0.5 text-[6px] text-neutral-600 dark:text-neutral-400">{card.meta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 px-3 py-2 text-[8px] dark:border-white/10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Webhook 200
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">entry.published · at-least-once</span>
          <span className="ml-auto font-mono text-neutral-600 dark:text-neutral-400">v12 saved</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f4ee] text-neutral-950 dark:bg-ink-950 dark:text-neutral-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-[#c2410c] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Перейти к контенту
      </a>

      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#f7f4ee]/85 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/80">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#c2410c] font-display text-lg font-extrabold text-white shadow-sm transition group-hover:bg-[#9a3412]">
              V
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">Verso</span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-600 sm:inline dark:text-neutral-400">
              Editorial CMS
            </span>
          </Link>

          <nav aria-label="Основная навигация" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-black/5 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle
              compact
              className="border-black/10 text-neutral-700 dark:border-white/15 dark:text-neutral-300"
            />
            <Link
              href="/sign-in"
              className="hidden rounded-full px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10 sm:inline-flex"
            >
              Войти
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#c2410c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9a3412]"
            >
              <span className="sm:hidden">CMS</span>
              <span className="hidden sm:inline">Открыть CMS</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden border-b border-black/5 dark:border-white/10">
          <div aria-hidden="true" className="landing-grid absolute inset-0" />
          <div
            aria-hidden="true"
            className="absolute -left-40 -top-40 size-[32rem] rounded-full bg-[#f97316]/10 blur-3xl dark:bg-[#f97316]/15"
          />
          <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-16 lg:pb-24">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#c2410c]/20 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-[#9a3412] shadow-sm backdrop-blur dark:border-[#fb923c]/25 dark:bg-white/5 dark:text-[#fb923c]">
                <span aria-hidden="true" className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#c2410c]/50 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-[#c2410c] dark:bg-[#fb923c]" />
                </span>
                Self-hosted · редакционная CMS
              </p>

              <h1 className="mt-6 max-w-2xl font-display text-[2.7rem] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-[4.35rem]">
                Verso — контент,
                <br />
                который удобно
                <br className="hidden sm:block" />{" "}
                <span className="relative whitespace-nowrap">
                  издавать
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1 left-0 h-2 w-full -rotate-1 rounded-full bg-[#f97316]/45 dark:bg-[#f97316]/35"
                  />
                </span>
                <span className="text-[#c2410c] dark:text-[#fb923c]">.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-lg">
                Коллекции, блочный конструктор, редполитика, медиатека, SEO и Headless API —
                в одной self-hosted системе. Без плагинов-костылей и внешней очереди.
              </p>

              <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c2410c] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#9a3412]"
                >
                  Открыть дашборд
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center justify-center rounded-xl border border-black/15 bg-white/60 px-6 py-3 font-semibold transition hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  Как это работает
                </a>
              </div>

              <ul
                className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-600 dark:text-neutral-400"
                role="list"
              >
                {STACK.map((item, index) => (
                  <li key={item} className="flex items-center gap-4">
                    {index > 0 && (
                      <span aria-hidden="true" className="size-1 rounded-full bg-current opacity-40" />
                    )}
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <BoardPreview />
          </div>
        </section>

        <section aria-label="Verso в цифрах" className="border-b border-black/5 dark:border-white/10">
          <dl className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-y-8 px-5 py-10 sm:px-8 lg:grid-cols-4 lg:gap-y-0 lg:divide-x lg:divide-black/5 dark:lg:divide-white/10">
            {METRICS.map((metric, index) => (
              <div
                key={metric.label}
                className={cn(
                  "flex flex-col-reverse gap-1",
                  index > 0 && "lg:pl-8",
                  index < METRICS.length - 1 && "lg:pr-8",
                )}
              >
                <dt className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {metric.label}
                </dt>
                <dd className="font-display text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="modules" aria-labelledby="modules-heading" className="scroll-mt-24">
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <SectionIntro
                eyebrow="Возможности"
                title="Шесть модулей из коробки"
                text="Всё нужное редакции, разработчику и маркетологу — без плагинов-костылей."
                headingId="modules-heading"
              />
              <p className="max-w-xs text-sm leading-relaxed text-neutral-600 sm:text-right dark:text-neutral-400">
                Одна кодовая база, один деплой и одна модель данных.
              </p>
            </div>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
              {MODULES.map((module) => (
                <li
                  key={module.title}
                  className={cn(
                    "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/75 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#f97316]/40 hover:shadow-lg motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-white/[0.04] sm:p-6",
                    module.span,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 place-items-center rounded-xl border border-[#f97316]/20 bg-[#f97316]/10 text-[#9a3412] dark:text-[#fb923c]"
                  >
                    <FeatureIcon name={module.icon} />
                  </span>
                  <h3 className="mt-3 font-display text-base font-bold sm:text-lg">{module.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {module.text}
                  </p>

                  {module.visual === "builder" && <BuilderVisual />}
                  {module.visual === "collections" && <CollectionsVisual />}

                  <ul className="mt-auto flex flex-wrap gap-1.5 pt-4" role="list">
                    {module.points.map((point) => (
                      <li
                        key={point}
                        className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-medium text-neutral-600 dark:border-white/10 dark:text-neutral-300"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="workflow"
          aria-labelledby="workflow-heading"
          className="scroll-mt-24 border-y border-black/5 bg-white/45 dark:border-white/10 dark:bg-white/[0.025]"
        >
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <SectionIntro
              eyebrow="Процесс"
              title="От идеи до публикации — один конвейер"
              text="Черновик, ревью, расписание и история версий связаны статусами записи. Ничего не теряется между шагами."
              headingId="workflow-heading"
            />
            <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4" role="list">
              {STEPS.map((step, index) => (
                <li
                  key={step.tag}
                  className="relative overflow-hidden rounded-2xl border border-black/10 bg-[#f7f4ee]/80 p-5 dark:border-white/10 dark:bg-ink-900/60"
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-4xl font-extrabold text-[#c2410c]/75 dark:text-[#fb923c]/70"
                  >
                    0{index + 1}
                  </span>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a3412] dark:text-[#fb923c]">
                    {step.tag}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="api" aria-labelledby="api-heading" className="scroll-mt-24">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:py-24">
            <div>
              <SectionIntro
                eyebrow="Headless"
                title="Контент — не только для этого сайта"
                text="Заберите материалы в Next.js, мобильное приложение, лендинг или витрину. Один API, понятные права и предсказуемые ошибки."
                headingId="api-heading"
              />
              <ul className="mt-6 grid gap-3 sm:grid-cols-2" role="list">
                {API_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
                  >
                    <CheckIcon />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative min-w-0">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-3 rounded-3xl bg-[#f97316]/10 blur-2xl"
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl shadow-black/20 dark:border-white/15">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <span aria-hidden="true" className="flex gap-1.5">
                    <span className="size-2 rounded-full bg-[#f97316]/70" />
                    <span className="size-2 rounded-full bg-amber-400/80" />
                    <span className="size-2 rounded-full bg-emerald-500/80" />
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    REST · /api/v1
                  </span>
                </div>
                <pre className="overflow-x-auto p-4 text-[11px] leading-relaxed text-neutral-300 sm:p-5 sm:text-xs">
                  <code>
                    <span className="text-[#fb923c]">$</span>{" "}
                    <span className="text-neutral-100">curl -s</span>{" "}
                    https://cms.example.com/api/v1/posts \
                    {"\n"}
                    {"    "}-H &quot;x-api-key: $VERSO_API_KEY&quot;
                    {"\n\n"}
                    <span className="text-emerald-300">{`{ "data": [ { "title": "Манифест редакции", "status": "PUBLISHED" } ] }`}</span>
                  </code>
                </pre>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3 text-[10px]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-1 font-semibold text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    200 OK
                  </span>
                  <span className="text-neutral-400">application/json · scoped key</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="principles"
          aria-labelledby="principles-heading"
          className="scroll-mt-24 border-y border-black/5 bg-white/45 dark:border-white/10 dark:bg-white/[0.025]"
        >
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <SectionIntro
              eyebrow="Принципы"
              title="Сделано для эксплуатации, а не для демо"
              text="Версия, которую можно развернуть на своём сервере, проверить в CI и доверить редакции."
              headingId="principles-heading"
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((principle) => (
                <article
                  key={principle.title}
                  className="rounded-2xl border border-black/10 bg-[#f7f4ee]/80 p-5 dark:border-white/10 dark:bg-ink-900/60"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 place-items-center rounded-xl border border-[#f97316]/20 bg-[#f97316]/10 text-[#9a3412] dark:text-[#fb923c]"
                  >
                    <PrincipleIcon name={principle.icon} />
                  </span>
                  <h3 className="mt-3 font-display text-base font-bold">{principle.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {principle.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-[#12121a] px-6 py-12 text-neutral-50 shadow-2xl shadow-black/20 sm:px-10 sm:py-16">
            <div
              aria-hidden="true"
              className="absolute -right-24 -top-24 size-80 rounded-full bg-[#f97316]/20 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-32 left-1/3 size-72 rounded-full bg-[#c2410c]/20 blur-3xl"
            />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fb923c]">
                  Готово к первой публикации
                </p>
                <h2
                  id="cta-heading"
                  className="mt-3 font-display text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl"
                >
                  Соберите редакционный процесс вокруг контента
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300 sm:text-base">
                  Разверните self-hosted Verso, создайте коллекцию и опубликуйте первый материал.
                  Демо-данные создаются seed-скриптом.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-[#12121a] transition hover:bg-neutral-200"
                >
                  Открыть дашборд
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                >
                  Войти
                </Link>
              </div>
            </div>
            <p className="relative mt-8 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
              SQLite · без внешней очереди · MIT
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-[#c2410c] font-display text-xs font-extrabold text-white">
                V
              </span>
              <span className="font-display text-base font-extrabold">Verso</span>
            </Link>
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
              Редакционная система для контента, который живёт долго.
            </p>
          </div>

          <nav aria-label="Ссылки в подвале" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a href="#modules" className="text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white">
              Возможности
            </a>
            <a href="#api" className="text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white">
              API
            </a>
            <a
              href="https://github.com/ssrjkk/verso"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
            >
              GitHub ↗
            </a>
            <a
              href="https://github.com/ssrjkk/verso/blob/main/docs/DECISIONS.md"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
            >
              ADR ↗
            </a>
          </nav>

          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            © 2026 Verso · MIT · Next.js 16
          </p>
        </div>
      </footer>
    </div>
  );
}
