import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  COLLECTION_FIELD_TYPES,
  FIELD_TYPE_LABELS,
} from "@/lib/collection-schema";
import { COLLECTION_TEMPLATES, getCollectionTemplate } from "@/lib/collection-templates";

export const metadata: Metadata = {
  title: "Редакционная Headless CMS для любого контента",
  description:
    "Self-hosted CMS: коллекции с настраиваемыми полями, 8 отраслевых шаблонов, блочный конструктор, редполитика, медиатека, SEO и Headless API. Next.js 16, tRPC, Prisma и SQLite.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Verso",
    title: "Verso — редакционная Headless CMS",
    description:
      "Коллекции с настраиваемыми полями, конструктор страниц, редполитика, медиатека, SEO и API в одном self-hosted приложении.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Verso — редакционная Headless CMS",
    description:
      "Контент, который удобно издавать: коллекции, шаблоны отраслей, конструктор страниц, SEO и API.",
  },
};

const NAV_LINKS = [
  { href: "#fields", label: "Поля и шаблоны" },
  { href: "#modules", label: "Возможности" },
  { href: "#workflow", label: "Процесс" },
  { href: "#api", label: "API" },
  { href: "#principles", label: "Принципы" },
];

const FACTS = [
  { value: "8", label: "отраслевых шаблонов" },
  { value: "8", label: "типов полей" },
  { value: "0", label: "внешних очередей" },
  { value: "MIT", label: "self-hosted, без вендор-лока" },
];

const MODULES = [
  {
    index: "01",
    title: "Коллекции и поля",
    frame: "border-frame-yellow",
    meta: "8 типов полей · 8 шаблонов",
    text: "У каждого типа контента своя схема: текст, числа, даты, списки, флажки, ссылки и email. Поля проверяются на сервере, а не только в форме.",
    points: ["без миграций под новую отрасль", "CSV-импорт и экспорт", "Headless-валидация"],
  },
  {
    index: "02",
    title: "Блочный конструктор",
    frame: "border-frame-teal",
    meta: "HERO · TEXT · MEDIA · CTA",
    text: "Страница собирается из блоков и живёт отдельно от коллекций. Порядок, видимость и предпросмотр — без правки шаблонов в коде.",
    points: ["drag-and-drop с клавиатуры", "предпросмотр до публикации", "ревизии блоков"],
  },
  {
    index: "03",
    title: "Редполитика",
    frame: "border-frame-violet",
    meta: "DRAFT → IN_REVIEW → PUBLISHED",
    text: "Канбан показывает, что ждёт редактора, фактчекера и выпускающего. Перемещение карточки меняет статус записи, а не только её вид.",
    points: ["роли ADMIN / MANAGER / VIEWER", "календарь публикаций", "история версий"],
  },
  {
    index: "04",
    title: "Медиатека",
    frame: "border-frame-blue",
    meta: "magic bytes · alt · лимиты",
    text: "Файлы хранятся на вашем сервере под безопасными именами. Тип проверяется по содержимому, а не по расширению; alt-текст доступен для поиска.",
    points: ["без внешнего CDN", "nosniff и sandbox", "поиск по alt"],
  },
  {
    index: "05",
    title: "SEO-инспектор",
    frame: "border-frame-lime",
    meta: "meta · OG · sitemap",
    text: "Заголовок, описание, Open Graph и канонический URL — в одном месте. Редиректы исполняются до рендера, sitemap и robots генерируются приложением.",
    points: ["301 и 302 с циклами", "проверки перед публикацией", "hits без блокировок"],
  },
  {
    index: "06",
    title: "Headless API и вебхуки",
    frame: "border-frame-coral",
    meta: "REST · HMAC · 429",
    text: "Контент забирают сайт, приложение и витрина. Ключи хранятся хешами, доступ ограничен scope, а события публикации уходят в транзакционный outbox.",
    points: ["at-least-once", "SSRF-защита", "Retry-After"],
  },
];

const STEPS = [
  {
    tag: "DRAFT",
    title: "Черновик",
    text: "Выберите шаблон, настройте поля и соберите материал в одном редакторе.",
  },
  {
    tag: "IN_REVIEW",
    title: "Ревью",
    text: "Канбан и календарь показывают, что ждёт редактора и фактчекера.",
  },
  {
    tag: "PUBLISHED",
    title: "Публикация",
    text: "Сразу или по расписанию; событие фиксируется вместе с записью.",
  },
  {
    tag: "REVISIONS",
    title: "История",
    text: "Каждая версия сохранена: вернитесь к любой без потери данных.",
  },
];

const API_POINTS = [
  "Чтение и запись по scope ключа",
  "Ключи хранятся только хешами",
  "429 с Retry-After на флуд",
  "Вебхуки с HMAC-SHA256",
];

const PRINCIPLES = [
  {
    title: "Данные у вас",
    text: "SQLite в режиме WAL, Prisma-миграции и backup без внешней БД. Контент не зависит от чужого облака.",
  },
  {
    title: "Безопасность по умолчанию",
    text: "SSRF-защита вебхуков, RBAC, scoped API-ключи и rate limit. UI не является границей доверия.",
  },
  {
    title: "Доступность как тест",
    text: "axe, контраст AA, клавиатура и reduced motion — в общих воротах CI, а не в списке пожеланий.",
  },
  {
    title: "Решения зафиксированы",
    text: "ADR в docs/DECISIONS.md; контракты держат тесты, а не обещания в презентации.",
  },
];

const STACK = ["Next.js 16", "React 19", "tRPC v11", "Prisma 7", "Better Auth", "Tailwind v4"];

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Verso",
  applicationCategory: "ContentManagementSystem",
  operatingSystem: "Web",
  description:
    "Self-hosted редакционная Headless CMS с настраиваемыми полями коллекций, блочным конструктором страниц, ревизиями, медиатекой, SEO-инспектором и API.",
  isAccessibleForFree: true,
  license: "https://opensource.org/licenses/MIT",
  featureList: MODULES.map((module) => module.title),
};

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0 text-accent-ink dark:text-accent-soft"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function Eyebrow({ index, children }: { index: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-ink dark:text-accent-soft">
      <span aria-hidden="true" className="inline-block h-px w-6 bg-accent dark:bg-accent-soft" />
      <span>{index}</span>
      {children}
    </p>
  );
}

function SchemaSheet() {
  const template = getCollectionTemplate("real_estate") ?? COLLECTION_TEMPLATES[0];
  return (
    <figure className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="relative border-[14px] border-frame-teal bg-paper-raised dark:bg-ink-900">
        <div className="flex items-center justify-between gap-3 border-b border-ink-950/15 px-4 py-3 dark:border-white/15">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400">
            Схема коллекции
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-ink dark:text-accent-soft">
            01 / 08
          </span>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              {template.name}
            </h2>
            <span className="shrink-0 font-mono text-[10px] text-stone-600 dark:text-stone-400">
              /real_estate
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{template.description}</p>

          <ol className="mt-5 border-t border-ink-950/10 dark:border-white/10">
            {template.fields.map((field, index) => (
              <li
                key={field.key}
                className="grid grid-cols-[1.7rem_1fr_auto] items-baseline gap-3 border-b border-ink-950/10 py-2.5 dark:border-white/10"
              >
                <span className="font-mono text-[10px] text-stone-600 dark:text-stone-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium">
                  {field.label}
                  {field.required ? (
                    <span className="ml-1 text-accent-ink dark:text-accent-soft" aria-label="обязательное">
                      *
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  {field.type}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <figcaption className="border-t border-ink-950/15 px-4 py-3 font-mono text-[10px] leading-relaxed uppercase tracking-[0.12em] text-stone-600 dark:border-white/15 dark:text-stone-400">
          Пример схемы из шаблона. Не скриншот интерфейса.
        </figcaption>
      </div>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink-950 dark:bg-ink-950 dark:text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-sm focus:bg-accent-strong focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Перейти к контенту
      </a>

      <header className="sticky top-0 z-50 border-b border-ink-950/10 bg-paper/90 backdrop-blur-md dark:border-white/10 dark:bg-ink-950/85">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-[2px] bg-accent-strong font-mono text-xs font-semibold text-white"
            >
              V
            </span>
            <span className="font-display text-xl font-bold tracking-[-0.02em]">Verso</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400 sm:inline">
              редакционная CMS
            </span>
          </Link>

          <nav aria-label="Основная навигация" className="hidden items-center gap-5 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-stone-600 transition-colors hover:text-accent-ink dark:text-stone-300 dark:hover:text-accent-soft"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle
              compact
              className="border-ink-950/20 text-stone-700 dark:border-white/20 dark:text-stone-300"
            />
            <Link
              href="/sign-in"
              className="hidden px-2 py-2 text-sm font-semibold text-stone-700 transition-colors hover:text-accent-ink dark:text-stone-300 dark:hover:text-accent-soft sm:inline-flex"
            >
              Войти
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-sm bg-accent-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
            >
              <span className="sm:hidden">CMS</span>
              <span className="hidden sm:inline">Открыть CMS</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden border-b border-ink-950/10 dark:border-white/10">
          <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-14 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:grid-cols-[1.04fr_0.96fr] lg:items-end lg:gap-16 lg:pb-20">
            <div className="min-w-0 landing-fade">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-ink dark:text-accent-soft">
                Self-hosted · Headless CMS · MIT
              </p>

              <h1 className="mt-5 max-w-3xl font-display text-[2.9rem] font-extrabold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[4.4rem]">
                Контент с редактурой, а не CRUD.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-600 dark:text-stone-300 sm:text-lg">
                Коллекции с настраиваемыми полями, блочный конструктор, редполитика, медиатека,
                SEO и Headless API. Одна self-hosted система для блога, услуг, товаров,
                недвижимости и любого другого контента.
              </p>

              <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-sm bg-accent-strong px-6 py-3 font-semibold text-white transition-colors hover:bg-accent-deep"
                >
                  Открыть дашборд
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="#fields"
                  className="inline-flex items-center justify-center rounded-sm border border-ink-950/25 px-6 py-3 font-semibold transition-colors hover:border-accent hover:text-accent-ink dark:border-white/25 dark:hover:border-accent-soft dark:hover:text-accent-soft"
                >
                  Посмотреть поля
                </a>
              </div>

              <ul
                className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400"
                role="list"
              >
                {STACK.map((item, index) => (
                  <li key={item} className="flex items-center gap-4">
                    {index > 0 && (
                      <span aria-hidden="true" className="size-1 rounded-full bg-accent/60" />
                    )}
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="landing-fade">
              <SchemaSheet />
            </div>
          </div>
        </section>

        <section aria-label="Факты о системе" className="border-b border-ink-950/10 dark:border-white/10">
          <dl className="mx-auto grid w-full max-w-7xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
            {FACTS.map((fact, index) => (
              <div
                key={fact.label}
                className={`flex flex-col-reverse gap-1 py-6 lg:py-7 ${
                  index > 0 ? "lg:border-l lg:border-ink-950/10 lg:pl-6 dark:lg:border-white/10" : ""
                }`}
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400">
                  {fact.label}
                </dt>
                <dd className="font-display text-3xl font-bold leading-none tracking-[-0.03em]">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="fields" aria-labelledby="fields-heading" className="scroll-mt-20 border-b border-ink-950/10 dark:border-white/10">
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <Eyebrow index="01">Под любой бизнес</Eyebrow>
                <h2
                  id="fields-heading"
                  className="mt-4 max-w-xl font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
                >
                  Схема, которую не надо программировать
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-stone-600 dark:text-stone-300 sm:text-base">
                  Поля коллекции хранятся в её схеме, а не в коде. Добавьте цену, адрес, дату
                  или вариант списка — форма, таблица, CSV и публичная страница подхватят это
                  без миграции. Пустая схема остаётся совместимой со старыми записями.
                </p>

                <ul className="mt-7 border-t border-ink-950/15 dark:border-white/15" aria-label="Типы полей">
                  {COLLECTION_FIELD_TYPES.map((type) => (
                    <li
                      key={type}
                      className="flex items-baseline justify-between gap-4 border-b border-ink-950/10 py-2 dark:border-white/10"
                    >
                      <span className="text-sm">{FIELD_TYPE_LABELS[type]}</span>
                      <code className="font-mono text-[10px] uppercase tracking-wider text-stone-600 dark:text-stone-400">
                        {type}
                      </code>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 font-mono text-[10px] leading-relaxed uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
                  Обязательность, подсказки и варианты списка задаются рядом.
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink-950/20 pb-2 dark:border-white/20">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400">
                    Шаблоны коллекций
                  </p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-ink dark:text-accent-soft">
                    08
                  </span>
                </div>
                <ol>
                  {COLLECTION_TEMPLATES.map((template, index) => (
                    <li
                      key={template.id}
                      className="grid grid-cols-[1.8rem_1fr] gap-x-3 gap-y-1 border-b border-ink-950/10 py-3.5 dark:border-white/10 sm:grid-cols-[1.8rem_9rem_1fr] sm:items-baseline"
                    >
                      <span className="font-mono text-[10px] text-stone-600 dark:text-stone-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-base font-semibold">{template.name}</span>
                      <span className="col-start-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400 sm:col-start-3">
                        {template.fields.slice(0, 4).map((field) => field.label).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                  Примеры полей из шаблонов в коде. После применения шаблон можно изменить
                  или удалить — это заготовка, а не жёсткая отрасль.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="modules" aria-labelledby="modules-heading" className="scroll-mt-20 border-b border-ink-950/10 dark:border-white/10">
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <div className="max-w-2xl">
              <Eyebrow index="02">Возможности</Eyebrow>
              <h2
                id="modules-heading"
                className="mt-4 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
              >
                Один инструмент вместо шести сервисов
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300 sm:text-base">
                Одна кодовая база, один деплой и одна модель данных. Модули не прикручены
                плагинами: они работают с общими записями, правами и историей.
              </p>
            </div>

            <ol className="mt-10 grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
              {MODULES.map((module) => (
                <li key={module.index} className="flex min-w-0 flex-col">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-ink-950 px-3 py-1 font-mono text-xs dark:border-white">
                      {module.index}
                    </span>
                    <p className="text-right font-mono text-[9px] uppercase tracking-[0.1em] text-stone-600 dark:text-stone-400">
                      {module.meta}
                    </p>
                  </div>
                  <div className={`flex flex-1 flex-col border-[14px] bg-paper p-5 dark:bg-ink-900 ${module.frame}`}>
                    <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">
                      {module.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                      {module.text}
                    </p>
                    <ul className="mt-5 grid gap-2 border-t border-ink-950/15 pt-4 text-xs leading-relaxed text-stone-700 dark:border-white/15 dark:text-stone-300">
                      {module.points.map((point) => (
                        <li key={point} className="flex gap-2">
                          <CheckIcon />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="workflow"
          aria-labelledby="workflow-heading"
          className="scroll-mt-20 border-b border-ink-950/10 bg-paper-sunken/40 dark:border-white/10 dark:bg-white/[0.025]"
        >
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <div className="max-w-2xl">
              <Eyebrow index="03">Процесс</Eyebrow>
              <h2
                id="workflow-heading"
                className="mt-4 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
              >
                От идеи до публикации — один конвейер
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300 sm:text-base">
                Черновик, ревью, расписание и история версий связаны статусами записи. Ничего
                не теряется между шагами и не дублируется в отдельной таблице.
              </p>
            </div>

            <ol className="mt-10 grid border-t-2 border-ink-950/20 dark:border-white/20 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.tag}
                  className="border-b border-ink-950/10 py-5 dark:border-white/10 md:pr-6 lg:border-b-0 lg:border-r lg:pl-6 lg:first:border-l-0 lg:first:pl-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-5xl font-bold leading-none tracking-[-0.04em] text-accent dark:text-accent-soft">
                      0{index + 1}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
                      {step.tag}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="api" aria-labelledby="api-heading" className="scroll-mt-20 border-b border-ink-950/10 dark:border-white/10">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:py-24">
            <div>
              <Eyebrow index="04">Headless</Eyebrow>
              <h2
                id="api-heading"
                className="mt-4 max-w-lg font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
              >
                Контент — не только для этого сайта
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300 sm:text-base">
                Заберите материалы в Next.js, мобильное приложение, лендинг или витрину.
                Один API, понятные права и предсказуемые ошибки — включая ошибки схемы.
              </p>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2" role="list">
                {API_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300"
                  >
                    <CheckIcon />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <figure className="min-w-0">
              <div className="overflow-hidden border border-ink-950/20 bg-ink-950 text-stone-200 shadow-[8px_8px_0_rgb(38_38_38_/_0.12)] dark:border-white/15">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
                    REST · /api/v1
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-soft">
                    200 OK
                  </span>
                </div>
                <pre className="overflow-x-auto p-4 text-[11px] leading-relaxed text-stone-300 sm:p-5 sm:text-xs">
                  <code>
                    <span className="text-accent-soft">$</span>{" "}
                    <span className="text-stone-100">curl -s</span>{" "}
                    https://cms.example.com/api/v1/posts \{"\n"}
                    {"    "}-H &quot;x-api-key: $VERSO_API_KEY&quot;
                    {"\n\n"}
                    <span className="text-emerald-300">{`{ "data": [ { "title": "Манифест редакции", "status": "PUBLISHED" } ] }`}</span>
                  </code>
                </pre>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-1 font-semibold text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    200 OK
                  </span>
                  <span className="text-stone-400">application/json · scoped key</span>
                </div>
              </div>
              <figcaption className="mt-3 font-mono text-[10px] leading-relaxed uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
                Пример запроса. Состав полей в ответе зависит от схемы коллекции.
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          id="principles"
          aria-labelledby="principles-heading"
          className="scroll-mt-20 border-b border-ink-950/10 dark:border-white/10"
        >
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <div className="max-w-2xl">
              <Eyebrow index="05">Принципы</Eyebrow>
              <h2
                id="principles-heading"
                className="mt-4 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
              >
                Сделано для эксплуатации, а не для демо
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300 sm:text-base">
                Версия, которую можно развернуть на своём сервере, проверить в CI и доверить
                редакции без выделенного DevOps-инженера.
              </p>
            </div>

            <ul className="mt-10 border-t border-ink-950/20 dark:border-white/20">
              {PRINCIPLES.map((principle, index) => (
                <li
                  key={principle.title}
                  className="grid gap-2 border-b border-ink-950/10 py-5 dark:border-white/10 sm:grid-cols-[2rem_13rem_1fr] sm:items-baseline sm:gap-4"
                >
                  <span className="font-mono text-[10px] tracking-wider text-stone-600 dark:text-stone-400">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <h3 className="font-display text-lg font-semibold">{principle.title}</h3>
                  <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                    {principle.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
          <div className="border-t-4 border-accent bg-ink-950 px-6 py-10 text-white sm:px-10 sm:py-14">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-soft">
                  Готово к первой публикации
                </p>
                <h2
                  id="cta-heading"
                  className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
                >
                  Соберите редакционный процесс вокруг контента
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-stone-300 sm:text-base">
                  Разверните self-hosted Verso, выберите отраслевой шаблон и опубликуйте
                  первый материал. Демо-данные создаются seed-скриптом, а не спрятаны в коде.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-sm bg-paper px-6 py-3 font-semibold text-ink-950 transition-colors hover:bg-white"
                >
                  Открыть дашборд
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-sm border border-white/30 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Войти
                </Link>
              </div>
            </div>
            <p className="mt-8 border-t border-white/15 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
              SQLite WAL · без внешней очереди · MIT
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-950/10 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-7 place-items-center rounded-[2px] bg-accent-strong font-mono text-[10px] font-semibold text-white"
              >
                V
              </span>
              <span className="font-display text-base font-bold">Verso</span>
            </Link>
            <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
              Редакционная система для контента, который живёт долго.
            </p>
          </div>

          <nav aria-label="Ссылки в подвале" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a href="#fields" className="text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft">
              Поля
            </a>
            <a href="#modules" className="text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft">
              Возможности
            </a>
            <a href="#api" className="text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft">
              API
            </a>
            <a
              href="https://github.com/ssrjkk/verso"
              target="_blank"
              rel="noreferrer"
              className="text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft"
            >
              GitHub ↗
            </a>
            <a
              href="https://github.com/ssrjkk/verso/blob/main/docs/DECISIONS.md"
              target="_blank"
              rel="noreferrer"
              className="text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft"
            >
              ADR ↗
            </a>
          </nav>

          <p className="text-xs text-stone-600 dark:text-stone-400">
            © 2026 Verso · MIT · Next.js 16
          </p>
        </div>
      </footer>
    </div>
  );
}
