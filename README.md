# Verso

Редакционный Headless CMS + конструктор страниц.
Стек: Next.js 16, React 19, Tailwind CSS v4 (oklch), tRPC v11, Prisma 7 + SQLite, Better Auth.

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Демо-вход: `admin@verso.dev` / `editor@verso.dev` / `viewer@verso.dev`, пароль `Test12345!` (создаётся сидом).

## Окружение

Все переменные — в `.env.example`: `DATABASE_URL`, `BETTER_AUTH_*`,
`NEXT_PUBLIC_APP_URL`, `TRUSTED_ORIGINS` (доп. origin через запятую),
`CRON_SECRET` (Bearer для `POST /api/cron/publish-due`, без него 503),
`PUBLISH_DUE_TICK_MS` (интервал самопубликации, выключен по умолчанию),
`WEBHOOK_ALLOW_PRIVATE=1` (только e2e-стенд; в проде процесс падает).

## Модули

- Коллекции + записи (DRAFT/IN_REVIEW/SCHEDULED/PUBLISHED/ARCHIVED), теги
- Блочный конструктор (HERO/FEATURES/PRICING/FAQ/RICH_TEXT/GALLERY/CODE/CTA) на dnd-kit
- Kanban редполитики (`/board`) — смена этапа = смена статуса
- Ревизии с откатом в 1 клик
- Медиатека, SEO-редиректы, календарь
- Headless API: `GET /api/v1/[collection]` с `x-api-key: vrs_live_…`
- Вебхуки `entry.published/entry.updated`
- Планировщик: SCHEDULED → PUBLISHED по `POST /api/cron/publish-due` (Bearer `CRON_SECRET`)
- Роли: ADMIN / MANAGER / VIEWER

## Скрипты

- `npm run typecheck` · `npm test` · `npm run test:e2e` · `npm run test:all` · `npm run build`
