/**
 * Снапшот ревизии: полное состояние записи без relations-дублей.
 *
 * В `entry` остаются все скалярные поля (SEO, статус, даты, stageId),
 * блоки и имена тегов лежат рядом. Relations (`blocks`, `tags`, `collection`,
 * `stage`, `author`, …) вырезаются, чтобы JSON не дублировал данные и не
 * разрастался при include.
 */
const RELATION_KEYS = new Set([
  "blocks",
  "tags",
  "collection",
  "stage",
  "author",
  "revisions",
  "activities",
  "tasks",
]);

export type SnapshotEntry = Record<string, unknown>;

export type ParsedSnapshot = {
  entry: SnapshotEntry;
  blocks: Record<string, unknown>[];
  tags?: string[];
};

export function buildEntrySnapshot(
  entry: object,
  blocks: readonly object[] = [],
  tags: readonly string[] = [],
): string {
  const scalar: SnapshotEntry = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!RELATION_KEYS.has(key)) scalar[key] = value;
  }
  return JSON.stringify({ entry: scalar, blocks, tags });
}

export function parseEntrySnapshot(json: string): ParsedSnapshot {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Некорректный снапшот ревизии");
  }
  const snap = parsed as { entry?: unknown; blocks?: unknown; tags?: unknown };
  if (!snap.entry || typeof snap.entry !== "object" || !Array.isArray(snap.blocks)) {
    throw new Error("Некорректный снапшот ревизии");
  }
  const tags = Array.isArray(snap.tags)
    ? snap.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined;
  return {
    entry: snap.entry as SnapshotEntry,
    blocks: snap.blocks.filter(
      (block): block is Record<string, unknown> => Boolean(block) && typeof block === "object",
    ),
    tags,
  };
}
