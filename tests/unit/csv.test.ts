import { describe, it, expect } from "vitest";
import { toCsv, parseCsv } from "@/lib/csv";

describe("csv RFC4180", () => {
  it("roundtrip with quotes", () => {
    const rows = [{ title: 'Кейс "Альфа", топ', slug: "alpha" }];
    const csv = toCsv(rows, ["title", "slug"]);
    const parsed = parseCsv(csv);
    expect(parsed[1][0]).toBe('Кейс "Альфа", топ');
  });
});

describe("csv RFC4180 edge cases", () => {
  it("multiline fields roundtrip", () => {
    const rows = [{ title: "Строка1\nСтрока2", slug: "multi" }];
    const csv = toCsv(rows, ["title", "slug"]);
    const parsed = parseCsv(csv);
    expect(parsed[1][0]).toBe("Строка1\nСтрока2");
  });

  it("empty values and CRLF", () => {
    const parsed = parseCsv("a,b\r\n,\r\n1,");
    expect(parsed).toEqual([
      ["a", "b"],
      ["", ""],
      ["1", ""],
    ]);
  });

  it("quotes inside quotes", () => {
    const parsed = parseCsv(toCsv([{ v: 'сказал "привет"' }], ["v"]));
    expect(parsed[1][0]).toBe('сказал "привет"');
  });

  it("commas preserved", () => {
    const parsed = parseCsv(toCsv([{ v: "a,b,c" }], ["v"]));
    expect(parsed[1][0]).toBe("a,b,c");
  });

  it("unicode roundtrip", () => {
    const rows = [{ title: "Привет, мир — 2026 ✓", slug: "privet" }];
    const parsed = parseCsv(toCsv(rows, ["title", "slug"]));
    expect(parsed[1]).toEqual(["Привет, мир — 2026 ✓", "privet"]);
  });

  it("header + rows shape (export contract)", () => {
    const csv = toCsv(
      [{ title: "T", slug: "s", status: "DRAFT", updatedAt: "2026-01-01T00:00:00.000Z" }],
      ["title", "slug", "status", "updatedAt"],
    );
    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual(["title", "slug", "status", "updatedAt"]);
    expect(parsed[1]).toEqual(["T", "s", "DRAFT", "2026-01-01T00:00:00.000Z"]);
  });
});
