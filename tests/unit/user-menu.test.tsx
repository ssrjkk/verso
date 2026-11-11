import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => {
  const state: { data: unknown; isPending: boolean } = { data: null, isPending: false };
  return {
    state,
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => mocks.state,
  signOut: mocks.signOut,
}));

import { UserMenu } from "@/components/user-menu";

beforeEach(() => {
  mocks.state.data = null;
  mocks.state.isPending = false;
});

describe("UserMenu", () => {
  it("во время загрузки показывает заглушку", () => {
    mocks.state.isPending = true;
    const html = renderToStaticMarkup(<UserMenu />);
    expect(html).toContain("Загрузка…");
    expect(html).not.toContain("Войти");
  });

  it("без сессии предлагает войти", () => {
    const html = renderToStaticMarkup(<UserMenu />);
    expect(html).toContain("Войти");
    expect(html).toContain('aria-label="Войти в аккаунт"');
  });

  it("ADMIN: имя, email, роль и выход", () => {
    mocks.state.data = {
      user: { name: "Анна", email: "anna@test.dev", role: "ADMIN" },
    };
    const html = renderToStaticMarkup(<UserMenu />);
    expect(html).toContain("Анна");
    expect(html).toContain("anna@test.dev");
    expect(html).toContain("Администратор");
    expect(html).toContain('aria-label="Выйти из аккаунта"');
  });

  it("неизвестная роль: показывает код роли, а не пустоту", () => {
    mocks.state.data = { user: { name: "", email: "x@test.dev", role: "OWNER" } };
    const html = renderToStaticMarkup(<UserMenu />);
    expect(html).toContain("Пользователь");
    expect(html).toContain("OWNER");
  });

  it("роль по умолчанию — VIEWER", () => {
    mocks.state.data = { user: { name: "V", email: "v@test.dev" } };
    const html = renderToStaticMarkup(<UserMenu />);
    expect(html).toContain("Наблюдатель");
  });
});
