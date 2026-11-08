# Corvid CMS

Блочно-коллекционная Headless CMS + Page Builder в дизайн-системе Corvid.
Стек: Next.js 16, React 19, Tailwind CSS v4 (oklch), tRPC v11, Prisma 7 + SQLite, Better Auth.

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Демо-вход: `test@corvid.dev` / `editor@corvid.dev` / `viewer@corvid.dev`, пароль `password123` (создаётся сидом).

## Модули

- Коллекции + записи (DRAFT/IN_REVIEW/SCHEDULED/PUBLISHED/ARCHIVED), теги
- Блочный конструктор (HERO/FEATURES/PRICING/FAQ/RICH_TEXT/GALLERY/CODE/CTA) на dnd-kit
- Kanban редполитики (`/board`) — смена этапа = смена статуса
- Ревизии с откатом в 1 клик
- Медиатека, SEO-редиректы, календарь
- Headless API: `GET /api/v1/[collection]` с `x-api-key: crv_live_…`
- Вебхуки `entry.published/entry.updated`
- Роли: ADMIN / MANAGER / VIEWER

## Скрипты

- `npm run typecheck` · `npm test` · `npm run test:e2e` · `npm run build`
