import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * SQLite-настройки соединения.
 *
 * `journal_mode=WAL` — читатели не блокируют писателя и наоборот: для
 * self-hosted CMS с фоновой публикацией это важнее, чем `DELETE`-журнал.
 * `synchronous=NORMAL` — безопасный для WAL компромисс: при падении процесса
 * последняя транзакция может потеряться, но БД не повреждается (в отличие от
 * `OFF`). `foreign_keys=ON` включает каскады на уровне SQLite: без него
 * `onDelete: Cascade` — только декларация в схеме. `busy_timeout` повторяет
 * опцию better-sqlite3 и защищает от мгновенного `SQLITE_BUSY`.
 *
 * PRAGMA выполняются на том же единственном соединении адаптера, поэтому
 * настройки действуют и внутри `$transaction` (adapter использует один
 * better-sqlite3 handle + mutex).
 */
const SQLITE_BUSY_TIMEOUT_MS = 5000;
const SQLITE_PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA foreign_keys = ON",
  `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`,
].join("; ");

type SqliteAdapter = Awaited<ReturnType<PrismaBetterSqlite3["connect"]>>;

/**
 * Фабрика-обёртка: Prisma не даёт передать PRAGMA в конструктор адаптера,
 * поэтому применяем их сразу после открытия соединения и до первого запроса.
 */
function withPragmas(factory: PrismaBetterSqlite3) {
  return {
    provider: "sqlite" as const,
    adapterName: factory.adapterName,
    async connect(): Promise<SqliteAdapter> {
      const adapter = await factory.connect();
      await adapter.executeScript(SQLITE_PRAGMAS);
      return adapter;
    },
    connectToShadowDb(): Promise<SqliteAdapter> {
      // Shadow DB нужна только Prisma Migrate; рабочие PRAGMA ей не требуются.
      return factory.connectToShadowDb();
    },
  };
}

export function createPrismaClient(
  url: string = process.env.DATABASE_URL ?? "file:./prisma/dev.db",
): PrismaClient {
  const factory = new PrismaBetterSqlite3({ url, timeout: SQLITE_BUSY_TIMEOUT_MS });
  return new PrismaClient({ adapter: withPragmas(factory) });
}
