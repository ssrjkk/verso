import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    signIn: { marker: "signIn" },
    signUp: { marker: "signUp" },
    signOut: { marker: "signOut" },
    useSession: { marker: "useSession" },
  };
  return { client, createAuthClient: vi.fn(() => client) };
});

vi.mock("better-auth/react", () => ({ createAuthClient: mocks.createAuthClient }));

import { signIn, signUp, signOut, useSession } from "@/lib/auth-client";

describe("auth-client", () => {
  it("создаёт клиент один раз и реэкспортирует его методы", () => {
    expect(mocks.createAuthClient).toHaveBeenCalledTimes(1);
    expect(mocks.createAuthClient).toHaveBeenCalledWith();
    expect(signIn).toBe(mocks.client.signIn);
    expect(signUp).toBe(mocks.client.signUp);
    expect(signOut).toBe(mocks.client.signOut);
    expect(useSession).toBe(mocks.client.useSession);
  });
});
