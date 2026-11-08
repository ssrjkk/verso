import { describe, it, expect } from "vitest";

// Чистая логика entry-роутера (src/server/routers/entry.ts), без БД:
// сборка snapshotJson из entry+blocks, парсинг, сравнение версий,
// маппинг targetState при moveStage. Зеркалит реализацию роутера.

type SnapshotEntry = { title: string; slug: string; fieldsJson: string };
type SnapshotBlock = { type: string; order: number; propsJson: string };
type Snapshot = { entry: SnapshotEntry; blocks: SnapshotBlock[] };

const TARGET_STATES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const;
type TargetState = (typeof TARGET_STATES)[number];

// entry.create / entry.update: snapshotJson = JSON.stringify({ entry, blocks })
function buildSnapshot(entry: SnapshotEntry, blocks: SnapshotBlock[]): string {
  return JSON.stringify({ entry, blocks });
}

// entry.restoreRevision: JSON.parse + извлечение полей
function parseSnapshot(json: string): Snapshot {
  const snap = JSON.parse(json) as Snapshot;
  if (!snap || typeof snap !== "object" || !snap.entry || !Array.isArray(snap.blocks)) {
    throw new Error("Некорректный снапшот ревизии");
  }
  return snap;
}

// restoreRevision переносит только title/fieldsJson/slug
function extractRestorable(snap: Snapshot): SnapshotEntry {
  return { title: snap.entry.title, fieldsJson: snap.entry.fieldsJson, slug: snap.entry.slug };
}

// entry.update: version = count + 1
function nextVersion(count: number): number {
  return count + 1;
}

// entry.moveStage: stage.targetState -> status; PUBLISHED ставит publishedAt
function resolveTargetState(raw: string): TargetState {
  if ((TARGET_STATES as readonly string[]).includes(raw)) return raw as TargetState;
  throw new Error(`Неизвестный targetState: ${raw}`);
}

function shouldPublish(targetState: TargetState): boolean {
  return targetState === "PUBLISHED";
}

describe("snapshot/restore", () => {
  it("roundtrip сохраняет entry+blocks", () => {
    const entry = { title: "Кейс", slug: "keys", fieldsJson: '{"a":1}' };
    const blocks = [
      { type: "HERO", order: 0, propsJson: "{}" },
      { type: "FAQ", order: 1, propsJson: '{"q":"?"}' },
    ];
    const snap = parseSnapshot(buildSnapshot(entry, blocks));
    expect(snap.entry.title).toBe("Кейс");
    expect(snap.entry.slug).toBe("keys");
    expect(snap.blocks).toHaveLength(2);
    expect(snap.blocks[1]).toEqual({ type: "FAQ", order: 1, propsJson: '{"q":"?"}' });
  });

  it("restore берёт только title/fieldsJson/slug", () => {
    const restored = extractRestorable(
      parseSnapshot(buildSnapshot({ title: "T", slug: "s", fieldsJson: "{}" }, [])),
    );
    expect(restored).toEqual({ title: "T", fieldsJson: "{}", slug: "s" });
  });

  it("версии монотонно растут", () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(1)).toBe(2);
    expect(nextVersion(41)).toBe(42);
  });

  it("битый снапшот кидает ошибку", () => {
    expect(() => parseSnapshot("not json")).toThrow();
    expect(() => parseSnapshot(JSON.stringify({ foo: 1 }))).toThrow();
    expect(() => parseSnapshot(JSON.stringify({ entry: { title: "x" } }))).toThrow();
  });

  it("снапшот переживает кавычки, запятые и переносы", () => {
    const entry = { title: 'Кейс "Альфа", топ\nвторая строка', slug: "a", fieldsJson: '{"t":"a,b\\"c"}' };
    const snap = parseSnapshot(buildSnapshot(entry, []));
    expect(snap.entry.title).toBe(entry.title);
    expect(JSON.parse(snap.entry.fieldsJson)).toEqual({ t: 'a,b"c' });
  });
});

describe("moveStage targetState mapping", () => {
  it.each([
    ["DRAFT", false],
    ["IN_REVIEW", false],
    ["PUBLISHED", true],
    ["ARCHIVED", false],
  ])("stage %s -> shouldPublish=%s", (target, publish) => {
    const resolved = resolveTargetState(target);
    expect(resolved).toBe(target);
    expect(shouldPublish(resolved)).toBe(publish);
  });

  it("неизвестный targetState кидает ошибку", () => {
    expect(() => resolveTargetState("DELETED")).toThrow();
    expect(() => resolveTargetState("")).toThrow();
  });

  it("publishedAt ставится только при публикации", () => {
    const applyStage = (targetState: TargetState, now: Date) => ({
      status: targetState,
      publishedAt: shouldPublish(targetState) ? now : undefined,
    });
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(applyStage("PUBLISHED", now)).toEqual({ status: "PUBLISHED", publishedAt: now });
    expect(applyStage("DRAFT", now).publishedAt).toBeUndefined();
    expect(applyStage("IN_REVIEW", now).publishedAt).toBeUndefined();
    expect(applyStage("ARCHIVED", now).publishedAt).toBeUndefined();
  });
});
