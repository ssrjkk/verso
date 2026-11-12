import { z } from "zod";

/**
 * Единый источник статусов записи.
 *
 * Строки статусов хранятся в SQLite как String, поэтому валидация входа —
 * единственный барьер против мусора вроде "DELETED" или произвольного
 * targetState у этапа workflow.
 */
export const ENTRY_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export const EntryStatus = z.enum(ENTRY_STATUSES);

export type EntryStatus = z.infer<typeof EntryStatus>;

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === "string" && (ENTRY_STATUSES as readonly string[]).includes(value);
}
