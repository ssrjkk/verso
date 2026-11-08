import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Параноидальная проверка сессионных кук: httpOnly + Lax/Strict (без них — кража через XSS / CSRF).
test("session cookie flags", async ({ context }) => {
  const cookies = await context.cookies();
  const sess = cookies.find((c) => c.name.includes("better-auth.session_token"));
  expect(sess, "session cookie present").toBeTruthy();
  expect(sess!.httpOnly, "httpOnly").toBe(true);
  expect(["Lax", "Strict"]).toContain(sess!.sameSite);
});
