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
| `CRON_SECRET` | `openssl rand -base64 32`; без него cron-маршруты (публикация и вебхуки) отдают **503** |

Опционально:

| Переменная | Когда нужна |
|---|---|
| `PUBLISH_DUE_TICK_MS` | Внутренний таймер публикации (если нет внешнего cron). Например `60000` |
| `WEBHOOK_DRAIN_TICK_MS` | Тик доставки outbox. По умолчанию `60000`; `0` выключает тик (нужен `/api/cron/webhooks`) |
| `WEBHOOK_MAX_ATTEMPTS` | Сколько HTTP-попыток до `FAILED`. По умолчанию `8` |
| `WEBHOOK_BASE_BACKOFF_MS` | База экспоненциального backoff. По умолчанию `60000`; потолок — 6 часов |
| `WEBHOOK_LEASE_MS` | Lease для `DELIVERING`, после которого зависшая доставка снова доступна. По умолчанию `600000` |
| `WEBHOOK_DRAIN_BATCH` | Сколько доставок разбирать за один drain. По умолчанию `50` |
| `WEBHOOK_RETENTION_DAYS` | Сколько дней хранить терминальные доставки. По умолчанию `30`; `0` — бессрочно |
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
4. Перезапустите процесс и проверьте `GET /`, `GET /api/health`, вход,
   `POST /api/cron/publish-due` и `POST /api/cron/webhooks` с боевым
   `CRON_SECRET`.
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

## 6. Планировщик публикаций и доставка вебхуков

Публикация (`SCHEDULED → PUBLISHED`) — два взаимозаменяемых способа:

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

Доставка вебхуков идёт через транзакционный outbox `WebhookDelivery`:

- событие и payload фиксируются в той же транзакции, что и изменение
  контента; сеть в транзакцию не входит;
- после коммита `kickWebhookDrain` запускает фоновый drain, а тик
  instrumentation раз в 60 секунд добирает всё, что осталось `PENDING`;
- `WEBHOOK_DRAIN_TICK_MS=0` выключает внутренний тик. Тогда нужен внешний
  cron (или собственный вызов):
  ```cron
  * * * * * curl -fsS -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    https://cms.example.com/api/cron/webhooks >/dev/null
  ```
- claim строки условный, поэтому тики нескольких инстансов и внешний cron не
  отправляют одну доставку дважды. Зависшая `DELIVERING` возвращается в
  оборот после `WEBHOOK_LEASE_MS`;
- на один drain — одна HTTP-попытка. Повторы планируются в БД с
  экспоненциальным backoff (`WEBHOOK_BASE_BACKOFF_MS`, потолок 6 часов) и
  переживают рестарт; после `WEBHOOK_MAX_ATTEMPTS` доставка становится
  `FAILED`;
- выключенный endpoint получает `FAILED` с причиной `Endpoint disabled`;
  повторное включение не воскрешает старые события;
- терминальные доставки (`DELIVERED`/`FAILED`) старше
  `WEBHOOK_RETENTION_DAYS` (по умолчанию 30 дней) удаляются автоматически
  при тике или cron, но не чаще раза в 6 часов на процесс. `0` оставляет
  их навсегда — тогда чистите вручную (см. раздел 7). Неудачная очистка
  (например, `SQLITE_BUSY`) не считается выполненной: следующий тик повторит
  её сразу, а не через 6 часов;
- гарантия — **at-least-once**: падение между HTTP-ответом и записью
  `DELIVERED` приведёт к повторной отправке. Получатель должен быть
  идемпотентным;
- порядок событий для одного endpoint не гарантируется: событие, ушедшее в
  backoff, может быть доставлено после более нового. Если порядок важен,
  consumer сверяет `updatedAt`/версию из payload, а не полагается на
  последовательность HTTP-запросов.

Оба cron-маршрута отвечают `503`, если `CRON_SECRET` не задан, и `401` при
чужом секрете.

## 7. Мониторинг и обслуживание

- **Health-проба:** `GET /api/health` выполняет `SELECT 1` и возвращает
  `200 {"status":"ok","checks":{"database":"ok"}}` либо
  `503 {"status":"degraded","checks":{"database":"down"}}` без текста ошибки,
  версий и путей. Ответ всегда `Cache-Control: no-store`. Настраивайте
  балансировщик/uptime-монитор на этот маршрут и считайте `503` поводом для
  алерта: приложение без SQLite не обслуживает запросы. Проба не проверяет
  uploads, cron и внешние получателей вебхуков — для них отдельные метрики.
- Свободное место на диске: SQLite пишет WAL, uploads и outbox растут
  независимо.
- Успешность backup и `PRAGMA integrity_check` (например, раз в неделю на
  копии, не на боевом файле).
- Ответ cron публикации: `200` и `published` в JSON; `401/503` — проблема
  конфигурации.
- Ответ cron вебхуков: `200` и счётчики
  `{claimed, delivered, retried, failed, pruned}`. Растущий `retried`/`failed`
  — проблема получателя или его доступности.
- Outbox: смотрите количество `PENDING`/`DELIVERING` и самые старые
  `nextAttemptAt`:
  ```bash
  sqlite3 "$DB" "SELECT status, COUNT(*), MIN(nextAttemptAt) \
    FROM \"WebhookDelivery\" GROUP BY status;"
  ```
  `DELIVERING` с давно истёкшим lease означает упавший процесс — следующий
  drain подхватит строку сам.
- `webhookEndpoint.lastStatus` в админке: повторяющиеся `5xx` — проблема
  получателя, а не CMS.
- ADMIN видит последние 20 доставок в настройках (статус, попытки, HTTP-код,
  ошибка); список обновляется кнопкой и после тестовой доставки. Payload и
  секреты в UI не попадают.
- Терминальные доставки (`DELIVERED`/`FAILED`) старше
  `WEBHOOK_RETENTION_DAYS` (по умолчанию 30 дней) удаляются автоматически
  при тике или cron, не чаще раза в 6 часов на процесс. `0` отключает
  автоматическую чистку. Если очистка упала на временной ошибке БД,
  шестичасовой интервал не начинается заново — следующий тик повторит
  попытку. Для немедленной уборки (предварительно сделав backup):
  ```bash
  CUTOFF=$(sqlite3 "$DB" \
    "SELECT strftime('%Y-%m-%dT%H:%M:%f+00:00','now','-30 days');")
  sqlite3 "$DB" "DELETE FROM \"WebhookDelivery\" \
    WHERE status IN ('DELIVERED','FAILED') AND nextAttemptAt < '$CUTOFF';"
  ```
  После большой чистки при необходимости выполните `VACUUM` в окно
  обслуживания.
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
