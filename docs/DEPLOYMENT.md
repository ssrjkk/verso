# Verso: деплой, обновление и backup

Документ для self-hosted эксплуатации. Verso использует **SQLite + локальные
файлы в `public/uploads`**, поэтому главное правило: база, загрузки и процесс
приложения должны жить на одном хосте с локальным диском. Сетевые ФС (NFS,
SMB) для SQLite не подходят — WAL требует корректных файловых блокировок.

## 1. Топология

Рекомендуемый минимум:

```text
интернет → HTTPS reverse proxy (Caddy/Nginx) → Next.js (один инстанс)
                                                ├── SQLite: /var/lib/verso/verso.db
                                                └── uploads: /srv/verso/public/uploads
```

- **Один инстанс приложения.** SQLite допускает несколько процессов, но
  rate-limit и очередь вебхуков хранят состояние в памяти процесса. Несколько
  инстансов не дадут общей защиты от перегрузки и предсказуемых ретраев.
- **Persistent volume.** `prisma/*.db` и `public/uploads` нельзя терять при
  пересборке контейнера/деплое. Смонтируйте их как volumes.
- **HTTPS обязателен:** Better Auth использует secure-cookies, API-ключи и
  HMAC-секреты вебхуков передаются только по TLS.
- **Reverse proxy:** не отдавайте наружу `.env`, `prisma/`, `node_modules/` и
  сам файл БД. Next.js отдаёт только `public/`, но лишние правила не помешают.

## 2. Переменные окружения

Минимум для production:

| Переменная | Значение |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Абсолютный путь: `file:/var/lib/verso/verso.db` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`; ≥32 символов, без `change-me`/`test`/`demo` |
| `BETTER_AUTH_URL` | Публичный URL, например `https://cms.example.com` |
| `NEXT_PUBLIC_APP_URL` | Тот же публичный URL |
| `TRUSTED_ORIGINS` | Доп. origin через запятую, если есть preview/alternate-домен |
| `CRON_SECRET` | `openssl rand -base64 32`; без него cron-маршрут отдаёт **503** |

Опционально:

| Переменная | Когда нужна |
|---|---|
| `PUBLISH_DUE_TICK_MS` | Внутренний таймер публикации (если нет внешнего cron). Например `60000` |
| `AUTH_RATELIMIT=off` | **Только throwaway/e2e.** В production не ставить |
| `VERSO_TEST_HARNESS=1` | **Только e2e.** В production не ставить |
| `WEBHOOK_ALLOW_PRIVATE=1` | **Только e2e.** В production приложение падает fail-fast |
| `SEED_ALLOW=1` | **Только одноразовый демо-стенд.** Не ставить на боевом |

Не храните `.env` в Git. Права на файл: `chmod 600`, владелец — пользователь
процесса.

## 3. Первый запуск

```bash
npm ci
npx prisma generate
npx prisma migrate deploy   # создаёт БД и применяет все миграции
npm run build
npm run start               # по умолчанию порт 3000
```

Порядок важен: миграции применяются **до** старта приложения. `npm run build`
сам по себе схему не обновляет.

Первый зарегистрированный пользователь на пустой БД становится `ADMIN`
(атомарно). Демо-сид на production требует `SEED_ALLOW=1` и создаёт известные
пароли — используйте его только на одноразовом стенде.

## 4. Обновление версии

1. Сделайте backup БД и uploads (см. ниже).
2. Выкатите новый код.
3. Выполните:
   ```bash
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   ```
4. Перезапустите процесс и проверьте `GET /`, вход и `POST /api/cron/publish-due`
   с боевым `CRON_SECRET`.
5. Если миграция сломала совместимость — откатывайтесь на предыдущий код и
   восстанавливайте БД из backup. Автоматического `down` у Prisma Migrate нет.

Проверить состояние миграций:

```bash
npx prisma migrate status
```

Правила:

- В production только `prisma migrate deploy`. `migrate dev`, `migrate reset`
  и `db push` — нет: они могут удалить данные.
- Новые миграции создаются локально (`npx prisma migrate dev --name ...`),
  коммитятся вместе со схемой и применяются на сервере через deploy.
- Не редактируйте уже применённую миграцию: создайте следующую.
- Существующую БД, которая раньше жила на `db push`, один раз переводят так:
  1. Сделайте backup.
  2. Проверьте, что схема отличается от текущей только индексами:
     ```bash
     npx prisma migrate diff --from-config-datasource \
       --to-schema prisma/schema.prisma --script
     ```
     В выводе должны быть только `CREATE INDEX` из
     `20261114000100_indexes` (никаких `CREATE TABLE`/`ALTER TABLE`).
  3. Отметьте baseline применённым и примените индексную миграцию:
     ```bash
     npx prisma migrate resolve --applied 20261114000000_baseline
     npx prisma migrate deploy
     npx prisma migrate status
     ```
  Для боевой БД шаги 2–3 лучше сначала прогнать на копии. Если diff показывает
  изменения таблиц/колонок, baseline не совпадает: не отмечайте его, а
  разберите drift вручную.

## 5. Backup

SQLite в режиме WAL — это `.db` **плюс** `-wal` и `-shm` во время работы.
Копирование одного `.db` на живой системе может дать несогласованный снимок.

### 5.1. БД: безопасный backup

Вариант A — `sqlite3 .backup` (рекомендуется, не останавливает приложение):

```bash
mkdir -p /var/backups/verso
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sqlite3 /var/lib/verso/verso.db \
  ".backup '/var/backups/verso/verso-$STAMP.db'"
sqlite3 "/var/backups/verso/verso-$STAMP.db" "PRAGMA integrity_check;"
```

`.backup` учитывает WAL и создаёт целостную копию. Проверка должна вернуть
`ok`.

Вариант B — остановка приложения:

```bash
systemctl stop verso
sqlite3 /var/lib/verso/verso.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp /var/lib/verso/verso.db /var/backups/verso/verso-$(date -u +%Y%m%dT%H%M%SZ).db
systemctl start verso
```

После checkpoint при остановленном процессе достаточно `.db`, но для
универсальности делайте `.backup`.

### 5.2. Uploads

```bash
tar -C /srv/verso/public -czf /var/backups/verso/uploads-$(date -u +%Y%m%dT%H%M%SZ).tgz uploads
```

Храните backup вне хоста (S3/второй сервер). Разумный минимум: ежедневный
backup + retention 7–30 дней; для активной редакции — чаще (например, каждый
час), потому что SQLite backup дешёвый.

### 5.3. Restore

1. Остановите приложение.
2. Удалите/переименуйте текущие `verso.db`, `verso.db-wal`, `verso.db-shm`.
3. Скопируйте backup в `DATABASE_URL` (права как у процесса).
4. Восстановите `public/uploads` из архива.
5. `npx prisma migrate deploy` — если backup старше кода, схема догонится.
6. Запустите приложение и проверьте `PRAGMA integrity_check` и вход.

Не запускайте `migrate deploy` на повреждённом/недокопированном файле: сначала
убедитесь, что `integrity_check` возвращает `ok`.

## 6. Планировщик публикаций

Два взаимозаменяемых способа:

1. **Внешний cron (предпочтительно):**
   ```cron
   * * * * * curl -fsS -X POST \
     -H "Authorization: Bearer $CRON_SECRET" \
     https://cms.example.com/api/cron/publish-due >/dev/null
   ```
   Маршрут идемпотентен: повторный/параллельный вызов публикует не более одной
   ревизии на запись.
2. **Внутренний таймер:** `PUBLISH_DUE_TICK_MS=60000`. Не включайте оба
   способа без необходимости: лишние тики безопасны, но расходуют ресурсы.

Если `CRON_SECRET` не задан, маршрут отвечает `503` (fail closed), а не
публикует без авторизации.

## 7. Мониторинг и обслуживание

- Свободное место на диске: SQLite пишет WAL, uploads растут независимо.
- Успешность backup и `PRAGMA integrity_check` (например, раз в неделю на
  копии, не на боевом файле).
- Ответ cron: `200` и `published` в JSON; `401/503` — проблема конфигурации.
- `webhookEndpoint.lastStatus` в админке: повторяющиеся `5xx` — проблема
  получателя, а не CMS.
- Рост БД: `VACUUM` допустим, но требует свободного места и блокировки;
  делайте его в окно обслуживания после backup.

## 8. Ограничения SQLite-развёртывания

- Один писатель: приложение уже ставит `busy_timeout=5000` и WAL, но тяжёлые
  импорты/массовые публикации лучше не запускать параллельно с backup.
- Горизонтальное масштабирование с общим SQLite-файлом не поддерживается.
- Локальный диск обязателен; контейнер без persistent volume потеряет и БД,
  и uploads.
- Для нескольких инстансов/больших нагрузок нужна миграция на PostgreSQL:
  это отдельный пакет работ с заменой baseline/миграций и SQLite-специфичных
  PRAGMA. Текущая схема и запросы к PostgreSQL переносятся, но SQL-миграции —
  нет.
