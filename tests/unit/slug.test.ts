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
});
