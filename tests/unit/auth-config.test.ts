import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthConfig = {
  emailAndPassword?: { enabled?: boolean };
  rateLimit?: { enabled?: boolean };
  session?: { expiresIn?: number };
  trustedOrigins?: string[];
  user?: { additionalFields?: { role?: { defaultValue?: string; input?: boolean } } };
  databaseHooks?: {
    user?: { create?: { after?: (user: { id: string }) => Promise<void> } };
  };
};

const mocks = vi.hoisted(() => ({
  config: null as AuthConfig | null,
  applySignupRolePolicy: vi.fn(),
  prismaAdapter: vi.fn(() => ({ adapter: "prisma" })),
  prisma: { marker: "prisma" },
}));

vi.mock("better-auth", () => ({
  betterAuth: (config: AuthConfig) => {
    mocks.config = config;
    return { marker: "auth" };
  },
}));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: mocks.prismaAdapter }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/first-admin", () => ({ applySignupRolePolicy: mocks.applySignupRolePolicy }));

const saved = {
  nodeEnv: process.env.NODE_ENV,
  secret: process.env.BETTER_AUTH_SECRET,
  phase: process.env.NEXT_PHASE,
  rateLimit: process.env.AUTH_RATELIMIT,
  harness: process.env.VERSO_TEST_HARNESS,
  authUrl: process.env.BETTER_AUTH_URL,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  origins: process.env.TRUSTED_ORIGINS,
};

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// @types/node 26 объявляет NODE_ENV readonly — в тесте его нужно менять.
function setNodeEnv(value: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.config = null;
  setNodeEnv("production");
  restore("BETTER_AUTH_SECRET", undefined);
  restore("NEXT_PHASE", undefined);
  restore("AUTH_RATELIMIT", undefined);
  restore("VERSO_TEST_HARNESS", undefined);
  restore("BETTER_AUTH_URL", undefined);
  restore("NEXT_PUBLIC_APP_URL", undefined);
  restore("TRUSTED_ORIGINS", undefined);
});

afterEach(() => {
  if (saved.nodeEnv !== undefined) setNodeEnv(saved.nodeEnv);
  restore("BETTER_AUTH_SECRET", saved.secret);
  restore("NEXT_PHASE", saved.phase);
  restore("AUTH_RATELIMIT", saved.rateLimit);
  restore("VERSO_TEST_HARNESS", saved.harness);
  restore("BETTER_AUTH_URL", saved.authUrl);
  restore("NEXT_PUBLIC_APP_URL", saved.appUrl);
  restore("TRUSTED_ORIGINS", saved.origins);
});

function importAuth() {
  return import("@/lib/auth");
}

describe("auth: production-секрет", () => {
  it("без секрета падает до создания клиента", async () => {
    await expect(importAuth()).rejects.toThrow(
      "BETTER_AUTH_SECRET must be a random value of at least 32 characters in production",
    );
    expect(mocks.prismaAdapter).not.toHaveBeenCalled();
  });

  it.each(["change-me", "test", "demo", "secret123", "Demo-secret"])(
    "слабый секрет %s отклоняется",
    async (secret) => {
      process.env.BETTER_AUTH_SECRET = secret;
      await expect(importAuth()).rejects.toThrow("BETTER_AUTH_SECRET");
    },
  );

  it("секрет короче 32 символов отклоняется", async () => {
    process.env.BETTER_AUTH_SECRET = "s".repeat(31);
    await expect(importAuth()).rejects.toThrow("at least 32 characters");
  });

  it("ровно 32 символа — достаточно", async () => {
    process.env.BETTER_AUTH_SECRET = "s".repeat(32);
    await expect(importAuth()).resolves.toBeDefined();
  });

  it("сильный секрет создаёт auth с безопасными настройками", async () => {
    process.env.BETTER_AUTH_SECRET = "s".repeat(40);
    const mod = await importAuth();

    expect(mod.auth).toEqual({ marker: "auth" });
    expect(mocks.prismaAdapter).toHaveBeenCalledWith(mocks.prisma, { provider: "sqlite" });
    expect(mocks.config).toMatchObject({
      emailAndPassword: { enabled: true },
      rateLimit: { enabled: true },
      session: { expiresIn: 60 * 60 * 24 * 7 },
      user: {
        additionalFields: {
          role: { type: "string", defaultValue: "VIEWER", required: false, input: false },
        },
      },
    });
  });

  it("build-фаза не требует секрет", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const mod = await importAuth();
    expect(mod.auth).toEqual({ marker: "auth" });
  });

  it("AUTH_RATELIMIT=off сам по себе не отключает проверку секрета", async () => {
    process.env.AUTH_RATELIMIT = "off";
    await expect(importAuth()).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("VERSO_TEST_HARNESS=1: секрет не нужен, AUTH_RATELIMIT отключает лимит", async () => {
    process.env.VERSO_TEST_HARNESS = "1";
    process.env.AUTH_RATELIMIT = "off";
    await importAuth();
    expect(mocks.config?.rateLimit).toEqual({ enabled: false });
  });

  it("VERSO_TEST_HARNESS=1 без AUTH_RATELIMIT: лимит остаётся включённым", async () => {
    process.env.VERSO_TEST_HARNESS = "1";
    await importAuth();
    expect(mocks.config?.rateLimit).toEqual({ enabled: true });
  });

  it("trustedOrigins: фильтрует пустые и склеивает источники", async () => {
    process.env.BETTER_AUTH_SECRET = "s".repeat(40);
    process.env.BETTER_AUTH_URL = "https://auth.test";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    process.env.TRUSTED_ORIGINS = " https://one.test, , https://two.test ";
    await importAuth();

    expect(mocks.config?.trustedOrigins).toEqual([
      "https://auth.test",
      "https://app.test",
      "https://one.test",
      "https://two.test",
    ]);
  });
});

describe("auth: bootstrap первого администратора", () => {
  beforeEach(() => {
    setNodeEnv("test");
  });

  async function afterHook() {
    await importAuth();
    const after = mocks.config?.databaseHooks?.user?.create?.after;
    expect(after).toBeTypeOf("function");
    return after as (user: { id: string }) => Promise<void>;
  }

  it("передаёт prisma и id нового пользователя", async () => {
    const after = await afterHook();
    await after({ id: "u1" });
    expect(mocks.applySignupRolePolicy).toHaveBeenCalledWith(mocks.prisma, "u1");
  });

  it("ошибка политики ролей логируется и не роняет регистрацию", async () => {
    const after = await afterHook();
    const failure = new Error("db down");
    mocks.applySignupRolePolicy.mockRejectedValueOnce(failure);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(after({ id: "u1" })).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith("[auth] applySignupRolePolicy failed:", failure);
    spy.mockRestore();
  });
});
