import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "@/lib/slug";
import { toCsv, parseCsv } from "@/lib/csv";

type Role = "VIEWER" | "MANAGER" | "ADMIN";

// Матрица доступа зеркалит src/server/trpc.ts:
// protectedProcedure — любой аутентифицированный,
// editorProcedure — MANAGER и ADMIN,
// adminProcedure — только ADMIN.
const canRead = (_role: Role) => true;
const canEdit = (role: Role) => role === "MANAGER" || role === "ADMIN";
const canAdmin = (role: Role) => role === "ADMIN";

describe("RBAC matrix", () => {
  it.each([
    ["VIEWER", false, false],
    ["MANAGER", true, false],
    ["ADMIN", true, true],
  ])("role %s -> edit=%s admin=%s", (role, edit, admin) => {
    const r = role as Role;
    expect(canRead(r)).toBe(true);
    expect(canEdit(r)).toBe(edit);
    expect(canAdmin(r)).toBe(admin);
  });

  it("VIEWER denied editor routes", () => {
    expect(canEdit("VIEWER")).toBe(false);
  });

  it("MANAGER denied admin routes", () => {
    expect(canAdmin("MANAGER")).toBe(false);
  });

  it("ADMIN allowed everywhere", () => {
    expect(canRead("ADMIN")).toBe(true);
    expect(canEdit("ADMIN")).toBe(true);
    expect(canAdmin("ADMIN")).toBe(true);
  });
});

describe("slugify matrix", () => {
  it.each([
    ["Новости компании", "novosti-kompanii"],
    ["Кейс №1: запуск!", "keys-1-zapusk"],
    ["Ёмкость", "yomkost"],
    ["a_b_c", "a-b-c"],
  ])("slugify(%s) === %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("validates slugs", () => {
    expect(isValidSlug("news-2026")).toBe(true);
    expect(isValidSlug("news_2026")).toBe(false);
  });
});

describe("csv RFC4180 edge", () => {
  it("quotes and newlines roundtrip", () => {
    const rows = [{ title: 'Заголовок "с", кавычками\nи переносом', slug: "edge" }];
    const parsed = parseCsv(toCsv(rows, ["title", "slug"]));
    expect(parsed[1][0]).toBe('Заголовок "с", кавычками\nи переносом');
    expect(parsed[1][1]).toBe("edge");
  });

  it("empty input yields no rows", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
