# Verso

> **Languages:** [English](README.md) · [Русский](README.ru.md)

Editorial headless CMS and block page builder for teams that need a complete
workflow: collections, entries, revisions, editorial board, scheduling and headless
delivery. The full Russian documentation is in [README.ru.md](README.ru.md).

**Site:** https://ssrjkk.github.io/verso/

## Features

- Entry statuses: `DRAFT`, `IN_REVIEW`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`.
- Per-collection field schemas with dynamic forms and server-side validation.
- Block page builder with keyboard-accessible drag-and-drop.
- Editorial Kanban board, revision snapshots and one-click rollback.
- Media uploads with magic-byte checks, UUID filenames and sandboxed delivery.
- SEO redirects with path, chain and cycle validation.
- Publication calendar and idempotent scheduled publishing.
- Headless API with scoped API keys and rate limits.
- Transactional webhook outbox with retries and SSRF-safe delivery.
- ADMIN, MANAGER and VIEWER roles with last-admin protection.

## Quick start

Node.js 20.9 or newer is required.

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and the application URLs.
Production requires a real auth secret; test-only switches are documented in
`.env.example` and must not be enabled in production.

## Checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run e2e
```

## API

- `GET /api/v1/{collection}` returns published entries for a read key.
- `POST /api/v1/{collection}` requires a `READ_WRITE` key.
- `POST /api/cron/publish-due` publishes due entries.
- `POST /api/cron/webhooks` drains pending outbox deliveries.

API keys belong in headers, never query strings. Cron routes require
`Authorization: Bearer ${CRON_SECRET}`.

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS v4, tRPC, Prisma, SQLite, Better Auth,
dnd-kit, Zod, Vitest, Playwright and axe.

## Security

- Server-side authorization guards and scoped API keys.
- DNS and IP checks for webhook destinations, including redirects.
- Controlled upload paths, MIME checks and size limits.
- Idempotent scheduling and transactional outbox.
- SQLite WAL, foreign keys, migrations and backup/restore tooling.
- Accessibility and security-header checks in E2E.

## Documentation

- [Russian README](README.ru.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security policy](SECURITY.md)

## License

MIT — see [LICENSE](LICENSE).
