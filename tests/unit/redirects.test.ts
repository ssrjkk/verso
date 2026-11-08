import { describe, expect, it } from "vitest";
import {
  MAX_REDIRECT_CHAIN,
  redirectPathIssue,
  validateRedirect,
  type RedirectEdge,
} from "@/lib/redirects";

const edge = (fromPath: string, toPath: string): RedirectEdge => ({ fromPath, toPath });

describe("redirectPathIssue", () => {
  it.each(["/", "/old", "/old/path", "/старый-путь"])(
    "fromPath принимает относительный путь %s",
    (path) => {
      expect(redirectPathIssue(path, "fromPath")).toBeNull();
    },
  );

  it.each([
    ["без слэша", "old"],
    ["абсолютный URL", "https://evil.example/x"],
    ["protocol-relative", "//evil.example/x"],
    ["обратный слэш", "/\\evil.example/x"],
    ["слэш в середине", "/old\\new"],
    ["query во fromPath", "/old?x=1"],
    ["hash во fromPath", "/old#top"],
    ["пробел", "/old path"],
    ["control-символ", "/old\u0000path"],
    ["служебный /api", "/api/users"],
    ["служебный /_next", "/_next/static/chunk.js"],
    ["служебный /uploads", "/uploads/a.png"],
    ["служебный /sign-in", "/sign-in"],
    ["служебный /sign-up", "/sign-up"],
  ])("fromPath отклоняет %s", (_label, path) => {
    expect(redirectPathIssue(path, "fromPath")).not.toBeNull();
  });

  it.each(["/new", "/new?x=1", "/new#section", "/sign-in", "/uploads/a.png"])(
    "toPath принимает относительный путь %s",
    (path) => {
      expect(redirectPathIssue(path, "toPath")).toBeNull();
    },
  );

  it.each([
    ["абсолютный URL", "https://evil.example/x"],
    ["protocol-relative", "//evil.example/x"],
    ["обратный слэш", "/\\evil.example/x"],
    ["javascript:", "javascript:alert(1)"],
    ["без слэша", "new"],
    ["служебный /api", "/api/users"],
    ["служебный /_next", "/_next/static/chunk.js"],
  ])("toPath отклоняет %s", (_label, path) => {
    expect(redirectPathIssue(path, "toPath")).not.toBeNull();
  });

  it("ограничивает длину fromPath и toPath", () => {
    expect(redirectPathIssue(`/${"a".repeat(600)}`, "fromPath")).not.toBeNull();
    expect(redirectPathIssue(`/${"a".repeat(3000)}`, "toPath")).not.toBeNull();
  });
});

describe("validateRedirect", () => {
  it("пропускает обычный редирект", () => {
    expect(validateRedirect("/old", "/new", [])).toBeNull();
  });

  it("запрещает редирект на себя", () => {
    expect(validateRedirect("/same", "/same", [])).not.toBeNull();
  });

  it("запрещает двухзвенный цикл", () => {
    const existing = [edge("/b", "/a")];
    expect(validateRedirect("/a", "/b", existing)).toMatch(/цикл/i);
  });

  it("запрещает трёхзвенный цикл", () => {
    const existing = [edge("/b", "/c"), edge("/c", "/a")];
    expect(validateRedirect("/a", "/b", existing)).toMatch(/цикл/i);
  });

  it(`разрешает цепочку ровно из ${MAX_REDIRECT_CHAIN} редиректов`, () => {
    const existing = [edge("/a", "/b"), edge("/b", "/c")];
    // a→b→c→d: три ребра, конец в обычной странице.
    expect(validateRedirect("/c", "/d", existing)).toBeNull();
  });

  it(`запрещает цепочку длиннее ${MAX_REDIRECT_CHAIN} редиректов`, () => {
    const existing = [edge("/a", "/b"), edge("/b", "/c"), edge("/c", "/d")];
    expect(validateRedirect("/d", "/e", existing)).toMatch(/цепочк/i);
  });

  it("не учитывает старую версию того же fromPath при замене", () => {
    const existing = [edge("/a", "/old-target")];
    // upsert заменяет /a → /old-target на /a → /new-target, старый край не мешает.
    expect(validateRedirect("/a", "/new-target", existing)).toBeNull();
  });

  it("не считает цепочкой неактивные редиректы (их просто нет в existing)", () => {
    // /y → /z выключен и в active-список не попадает: цепочка обрывается на /y.
    expect(validateRedirect("/x", "/y", [])).toBeNull();
  });
});
