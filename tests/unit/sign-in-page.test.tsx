// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  demo: { email: "", password: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/auth-client", () => ({
  signIn: { email: mocks.signIn },
}));
// Vite инлайнит process.env.NODE_ENV на этапе трансформации, поэтому
// production-ветку проверяем через контракт demoCredentials, а не stubEnv.
vi.mock("@/lib/demo-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo-access")>();
  return {
    ...actual,
    demoCredentials: () => ({ ...mocks.demo }),
  };
});

import SignInPage from "@/app/(auth)/sign-in/page";

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.signIn.mockReset();
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.demo = { email: "admin@verso.dev", password: "Test12345!" };
  window.history.replaceState({}, "", "/sign-in");
});

afterEach(() => {
  cleanup();
});

async function submit() {
  render(<SignInPage />);
  await userEvent.click(screen.getByRole("button", { name: "Войти" }));
}

describe("SignInPage", () => {
  it("в dev-режиме подставляет демо-креды", () => {
    render(<SignInPage />);
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "admin@verso.dev",
    );
    expect((screen.getByLabelText("Пароль") as HTMLInputElement).value).toBe(
      "Test12345!",
    );
  });

  it("production: демо-креды не предзаполнены", () => {
    mocks.demo = { email: "", password: "" };
    render(<SignInPage />);
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Пароль") as HTMLInputElement).value).toBe("");
  });

  it("после входа уходит на безопасный ?next=", async () => {
    window.history.replaceState({}, "", "/sign-in?next=%2Fcollections%3Fview%3Dboard");
    await submit();
    expect(mocks.push).toHaveBeenCalledWith("/collections?view=board");
  });

  it("внешний ?next= отбрасывается в пользу /dashboard", async () => {
    window.history.replaceState({}, "", "/sign-in?next=https%3A%2F%2Fevil.test");
    await submit();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("service-путь в ?next= не используется", async () => {
    window.history.replaceState({}, "", "/sign-in?next=%2Fapi%2Fupload");
    await submit();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("ошибка входа показывается и не редиректит", async () => {
    mocks.signIn.mockResolvedValue({ error: { message: "Неверный пароль" } });
    await submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Неверный пароль");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
