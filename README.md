# Verso

[![CI](https://github.com/ssrjkk/verso/actions/workflows/ci.yml/badge.svg)](https://github.com/ssrjkk/verso/actions/workflows/ci.yml)
![Node >= 20.9](https://img.shields.io/badge/node-%3E%3D20.9-339933?logo=node.js&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-f97316)

**Verso** — редакционный Headless CMS и блочный конструктор страниц.  
Сделан для команд, которым нужен не «ещё один CRUD», а понятный рабочий цикл: коллекции → записи → ревизии → канбан редполитики → публикация → headless-выдача.

> Стек: **Next.js 16 (App Router)** · **React 19** · **tRPC v11** · **Prisma 7 + SQLite** · **Better Auth** · **Tailwind CSS v4** · **dnd-kit** · **Zod** · **Vitest** · **Playwright + axe**

---

## Возможности

| Модуль | Что есть |
|---|---|
| **Контент** | Коллекции и записи со статусами `DRAFT → IN_REVIEW → SCHEDULED → PUBLISHED → ARCHIVED`, теги, поиск/фильтры |
| **Конструктор** | Блочный page builder (HERO, FEATURES, PRICING, FAQ, RICH_TEXT, GALLERY, CODE, CTA) с drag-and-drop на dnd-kit (мышь + клавиатура) |
| **Редполитика** | Канбан `/board`: перетаскивание карточек между этапами меняет статус; доступна клавиатурная работа |
| **Ревизии** | Снапшоты изменений и откат в 1 клик |
| **Медиа** | Загрузка с проверкой magic bytes, случайные имена на диске, ограничение типов/размера, безопасная отдача (`nosniff` + `sandbox` для `/uploads`) |
| **SEO** | Редиректы (301/302), исполняемые в proxy до рендера; валидация путей/цепочек/циклов; атомарный счётчик hits |
| **Календарь** | Задачи и планирование публикаций |
| **Headless API** | `GET /api/v1/[collection]` по API-ключу (`x-api-key` или `Authorization: Bearer`, ключи формата `vrs_live_…`); READ-ключ видит только `PUBLISHED` |
| **Вебхуки** | `entry.published`, `entry.updated` — доставка после коммита (fire-and-forget), SSRF-безопасная, с ретраями и сохранением статуса последней доставки |
| **Планировщик** | `SCHEDULED → PUBLISHED` идемпотентно: `POST /api/cron/publish-due` (Bearer `CRON_SECRET`, fail-closed 503) или опциональный `PUBLISH_DUE_TICK_MS` |
| **Доступ** | Роли `ADMIN` / `MANAGER` / `VIEWER`; signup → `VIEWER`; первый пользователь пустой БД → `ADMIN` атомарно; защита «последний админ» и запрет смены собственной роли в транзакции |

## Безопасность и надёжность (реализовано, не «планируется»)

- **Auth/roles:** роль не принимается от клиента; серверные guard’ы в tRPC (`protected`/`editor`/`admin`); UI не является границей доверия.
- **Вебхуки:** только `http(s)`, запрет private/loopback/link-local/metadata по DNS+IP, переподключение к проверенному IP, ручные редиректы с перепроверкой, таймаут, без чтения тела. Флаг `WEBHOOK_ALLOW_PRIVATE=1` — только тестовый стенд; в прод-конфигурации процесс падает fail-fast.
- **API:** ключи только в заголовках (никакого `?key=`), `lastUsedAt` с троттлингом, token-bucket лимиты (`/api/v1/*` и `/api/upload`, `429` + `Retry-After`).
- **Загрузки:** magic bytes, управляемые пути `/uploads/<folder>/<uuid>.<ext>`, реальные размеры; `media.create` не принимает произвольный URL/mime/size.
- **Редиректы:** относительные безопасные пути, запрет open-redirect/циклов/длинных цепочек, исполнение в `src/proxy.ts`.
- **Планировщик:** условный статусный флип в транзакции → параллельный запуск даёт ровно 1 ревизию / 1 вебхук на запись.
- **A11y:** проверка axe `0 serious/critical` на ключевых страницах в light/dark, контраст ≥ 4.5:1 для обычного текста, видимое фокус-кольцо, клавиатурные сценарии (в т.ч. DnD), скриншотные проверки в e2e.
- **Базовые headers:** `nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN` (+ `sandbox` для uploads), `poweredByHeader: false`.

Подробности и компромиссы — в [`docs/DECISIONS.md`](docs/DECISIONS.md) (проблема → решение → почему → цена).

## Быстрый старт

Требования: **Node.js >= 20.9** (проверено на Node 22).

```bash
cp .env.example .env
npm ci              # или npm install
npm run db:push     # применить схему Prisma
npm run db:seed     # демо-данные и пользователи
npm run dev         # http://localhost:3000
```

Демо-аккаунты (создаются сидом), пароль **`Test12345!`**:

| Email | Роль |
|---|---|
| `admin@verso.dev` | ADMIN |
| `editor@verso.dev` | MANAGER |
| `viewer@verso.dev` | VIEWER |

## Переменные окружения

См. [`.env.example`](.env.example). Ключевые:

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | SQLite, по умолчанию `file:./prisma/dev.db` |
| `BETTER_AUTH_SECRET` | Секрет auth: в проде обязателен, ≥32 символов, без `change-me`/`test`/`demo` (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Базовые URL приложения |
| `TRUSTED_ORIGINS` | Доп. origin через запятую (опционально) |
| `CRON_SECRET` | Bearer-секрет для `POST /api/cron/publish-due` (без него маршрут отдаёт **503**) |
| `PUBLISH_DUE_TICK_MS` | Интервал самопубликации, мс (опционально; по умолчанию выключен) |
| `AUTH_RATELIMIT=off` | **Только e2e/throwaway-БД:** отключает rate-limit входов (проверку секрета не ослабляет) |
| `VERSO_TEST_HARNESS=1` | **Только e2e/throwaway-БД:** разрешает короткий/демо-секрет и `WEBHOOK_ALLOW_PRIVATE`; в проде небезопасен |
| `WEBHOOK_ALLOW_PRIVATE=1` | **Только e2e** (требует `VERSO_TEST_HARNESS=1`); в прод-конфигурации — fail-fast |
| `SEED_ALLOW=1` | **Только throwaway-инстанс:** разрешает `npm run db:seed` с демо-паролем на production |

## API / интеграции

- **Headless read:** `GET /api/v1/{collection}`  
  Заголовок: `x-api-key: vrs_live_…` (или `Authorization: Bearer ...`). READ-ключ возвращает только опубликованные записи. Лимит запросов применяется; при превышении — `429` + `Retry-After`.
- **Cron publish:** `POST /api/cron/publish-due`  
  Заголовок: `Authorization: Bearer ${CRON_SECRET}`. Идемпотентно публикует просроченные `SCHEDULED`.
- **Webhooks:** события `entry.published`, `entry.updated`; статусы доставок сохраняются (без логирования секретов/приватных адресов в пользовательском UI).
- **Sitemap:** `/sitemap.xml` (канонический) и совместимый `/api/sitemap.xml`; `robots.txt` запрещает приватные разделы.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Dev-сервер (с `prisma generate` в pre-hook) |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Запуск production-сборки |
| `npm run typecheck` | `tsc --noEmit` (с `prisma generate` в pre-hook) |
| `npm test` | Vitest (unit/integration) |
| `npm run test:e2e` | Playwright (e2e, свой `e2e.db`, fresh-build guard) |
| `npm run test:all` | **Полный гейт:** typecheck + vitest + build + e2e (как в CI) |
| `npm run db:push` | Синхронизация схемы Prisma |
| `npm run db:seed` | Сид демо-данных (с `prisma generate` в pre-hook; на production требует `SEED_ALLOW=1`) |
| `npm run db:studio` | Prisma Studio |

## Тестирование и CI

- **Vitest:** 53 файла / 566 тестов (в т.ч. интеграции на реальном SQLite, SSRF/redirect/scheduler/auth/upload контракты).
- **Playwright:** 39 e2e-файлов / 83 теста, включая axe-проверки доступности и визуальные/overflow сценарии.
- **CI (GitHub Actions):** `npm ci` → Playwright Chromium → `npm run test:all` на `ubuntu-latest` (Node 22), с `concurrency` и минимальными `permissions`.  
  Локально воспроизводится тем же `npm run test:all`.

## Структура (ориентир)

```text
src/
  app/                 # App Router: (auth), (dashboard), api/*, robots, sitemap, boundaries
  components/          # UI, блоки конструктора, dashboard-компоненты
  lib/                 # prisma, auth, roles, webhook, redirects, publish-due, upload, rate-limit, sitemap-data
  server/              # tRPC routers + context/procedures
  proxy.ts             # auth + SEO redirects (до рендера)
  instrumentation.ts   # опциональный тик publishDue
prisma/                # schema, seed, migrations/config
tests/                 # vitest + e2e (playwright)
docs/DECISIONS.md      # ADR-журнал
```

## Решения и компромиссы

Архитектурные решения зафиксированы в [`docs/DECISIONS.md`](docs/DECISIONS.md): для каждого пункта — **проблема → решение → почему → цена** (роли/bootstrap, вебхуки/SSRF, редиректы, планировщик, headless-лимиты, загрузки/magic bytes, a11y/контраст, воспроизводимая установка, демо-доступы и инварианты публикации).

## Лицензия

[MIT](LICENSE) © 2026 Verso contributors
