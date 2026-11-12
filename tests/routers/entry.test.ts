import { describe, it, expect } from "vitest";
import { buildEntrySnapshot, parseEntrySnapshot } from "@/lib/entry-snapshot";
import { ENTRY_STATUSES, isEntryStatus } from "@/lib/entry-status";

// Контракт реальных модулей (не копия логики роутера): снапшот ревизии
// должен переживать roundtrip целиком, а relations — не дублироваться.
describe("entry snapshot", () => {
  it("roundtrip сохраняет скаляры, блоки и теги, вырезая relations", () => {
    const entry = {
      id: "e1",
      collectionId: "c1",
      title: "Кейс",
      slug: "keys",
      fieldsJson: '{"a":1}',
      status: "PUBLISHED",
      publishedAt: "2026-01-01T00:00:00.000Z",
      seoTitle: "SEO",
      noIndex: true,
      stageId: "s1",
      blocks: [{ id: "b1" }],
      tags: [{ tag: { name: "alpha" } }],
      collection: { id: "c1" },
      stage: { id: "s1" },
      author: { id: "u1" },
    };
    const blocks = [
      { type: "HERO", order: 0, propsJson: "{}" },
      { type: "FAQ", order: 1, propsJson: '{"q":"?"}' },
    ];

    const snap = parseEntrySnapshot(buildEntrySnapshot(entry, blocks, ["alpha", "beta"]));

    expect(snap.entry).toMatchObject({
      title: "Кейс",
      slug: "keys",
      fieldsJson: '{"a":1}',
      status: "PUBLISHED",
      publishedAt: "2026-01-01T00:00:00.000Z",
      seoTitle: "SEO",
      noIndex: true,
      stageId: "s1",
    });
    for (const relation of ["blocks", "tags", "collection", "stage", "author"]) {
      expect(snap.entry).not.toHaveProperty(relation);
    }
    expect(snap.blocks).toHaveLength(2);
    expect(snap.blocks[1]).toEqual({ type: "FAQ", order: 1, propsJson: '{"q":"?"}' });
    expect(snap.tags).toEqual(["alpha", "beta"]);
  });

  it("старые снапшоты без tags дают undefined (текущие связи не стираются)", () => {
    const snap = parseEntrySnapshot(
      JSON.stringify({ entry: { title: "T", slug: "s", fieldsJson: "{}" }, blocks: [] }),
    );
    expect(snap.tags).toBeUndefined();
  });

  it("не-строки в tags отфильтровываются", () => {
    const snap = parseEntrySnapshot(
      JSON.stringify({ entry: { title: "T" }, blocks: [], tags: ["a", 1, null, "b"] }),
    );
    expect(snap.tags).toEqual(["a", "b"]);
  });

  it("битый снапшот кидает ошибку", () => {
    expect(() => parseEntrySnapshot("not json")).toThrow();
    expect(() => parseEntrySnapshot(JSON.stringify({ foo: 1 }))).toThrow();
    expect(() => parseEntrySnapshot(JSON.stringify({ entry: { title: "x" } }))).toThrow();
  });

  it("снапшот переживает кавычки, запятые и переносы", () => {
    const entry = {
      title: 'Кейс "Альфа", топ\nвторая строка',
      slug: "a",
      fieldsJson: '{"t":"a,b\\"c"}',
    };
    const snap = parseEntrySnapshot(buildEntrySnapshot(entry, []));
    expect(snap.entry.title).toBe(entry.title);
    expect(JSON.parse(snap.entry.fieldsJson as string)).toEqual({ t: 'a,b"c' });
  });
});

describe("entry statuses", () => {
  it.each(ENTRY_STATUSES)("%s — валидный статус", (status) => {
    expect(isEntryStatus(status)).toBe(true);
  });

  it.each(["DELETED", "", "published", null, 42])("%s отклоняется", (value) => {
    expect(isEntryStatus(value)).toBe(false);
  });
});
