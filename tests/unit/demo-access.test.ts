import { describe, expect, it } from "vitest";
import { assertSeedAllowed, demoCredentials } from "@/lib/demo-access";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("demo access", () => {
  it("production без SEED_ALLOW запрещает демо-сид", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production" })).toThrow(
      "Refusing to seed demo users in production",
    );
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", SEED_ALLOW: "0" }),
    ).toThrow();
  });

  it("production с явным SEED_ALLOW=1 разрешает (throwaway-инстанс)", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", SEED_ALLOW: "1" }),
    ).not.toThrow();
  });

  it("вне production сид разрешён без флага", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
  });

  it("форма входа не подставляет демо-креды в production", () => {
    expect(demoCredentials("production")).toEqual({ email: "", password: "" });
  });

  it("в dev/test демо-креды доступны", () => {
    expect(demoCredentials("development")).toEqual({
      email: "admin@verso.dev",
      password: "Test12345!",
    });
  });
});

describe("safeInternalPath", () => {
  it("пропускает относительные внутренние пути с query", () => {
    expect(safeInternalPath("/collections")).toBe("/collections");
    expect(safeInternalPath("/entries/1?tab=seo")).toBe("/entries/1?tab=seo");
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/api/upload",
    "/api",
    "/_next/static/x",
    "",
    null,
    undefined,
  ])("отклоняет %s", (value) => {
    expect(safeInternalPath(value)).toBe("/dashboard");
  });

  it("уважает явный fallback", () => {
    expect(safeInternalPath("https://evil.test", "/")).toBe("/");
  });
});
