import { describe, it, expect } from "vitest";
import { safeImageUrl } from "@/lib/og-image";

describe("safeImageUrl", () => {
  it.each([
    ["https://cdn.example.com/a.png", "https://cdn.example.com/a.png"],
    ["http://cdn.example.com/a.png", "http://cdn.example.com/a.png"],
    ["cdn.example.com/a.png", "https://cdn.example.com/a.png"],
    ["  https://ok.example/a.png  ", "https://ok.example/a.png"],
    ["/uploads/og/ab12cd.png", "/uploads/og/ab12cd.png"],
  ])("keeps %s", (input, expected) => {
    expect(safeImageUrl(input)).toBe(expected);
  });

  // Схемы, которые браузер исполняет или которые уводят на чужой домен.
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "blob:https://x/y",
    "about:blank",
    "//evil.example/a.png",
    "/\\evil.example/a.png",
    "\\\\evil.example\\a.png",
    "/uploads/a.png\\",
    "<script>alert(1)</script>",
    "/a b.png",
    "https://",
    "",
    "   ",
    "\njavascript:alert(1)",
  ])("drops %s", (input) => {
    expect(safeImageUrl(input)).toBe("");
  });

  it("drops an absent field", () => {
    expect(safeImageUrl(undefined)).toBe("");
  });
});
