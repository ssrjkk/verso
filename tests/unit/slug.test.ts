import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "@/lib/slug";

describe("slug", () => {
  it("transliterates RU", () => {
    expect(slugify("Привет, мир! Кейсы 2026")).toBe("privet-mir-keysy-2026");
  });
  it("validates", () => {
    expect(isValidSlug("my-post-1")).toBe(true);
    expect(isValidSlug("Bad Slug!")).toBe(false);
  });
});

describe("slug matrix", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["UPPER CASE", "upper-case"],
    ["my_post", "my-post"],
    ["a---b", "a-b"],
    ["  spaces  ", "spaces"],
    ["123", "123"],
    ["Ёжик", "yozhik"],
    ["Щука", "shchuka"],
    ["пробелы", "probely"],
    ["", ""],
    ["---", ""],
  ])("slugify(%s) === %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("isValidSlug matrix", () => {
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("a-b-c-123")).toBe(true);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("ABC")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
  });

  it("trims to 120 chars", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(120);
  });

  // Страж против возврата к квантификаторам по дефисам (`-+`, `-{2,}`):
  // CodeQL считает их polynomial-redos на пользовательском вводе.
  it("stays linear on dash-heavy input", () => {
    for (const input of ["-".repeat(20000), "a-".repeat(10000), "-".repeat(20000) + "a"]) {
      const started = performance.now();
      slugify(`${input}!!!!`);
      expect(performance.now() - started).toBeLessThan(200);
    }
    expect(slugify("-".repeat(20000))).toBe("");
    expect(slugify("a".repeat(50) + "-".repeat(200))).toBe("a".repeat(50));
  });
});
