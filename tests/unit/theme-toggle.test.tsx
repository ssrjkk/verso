import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ setTheme: vi.fn() }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", resolvedTheme: "dark", setTheme: mocks.setTheme }),
}));

import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle: серверный рендер", () => {
  it("до гидратации показывает детерминированный disabled-плейсхолдер", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);

    expect(html).toContain("Тема: …");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="Переключить тему"');
    expect(mocks.setTheme).not.toHaveBeenCalled();
  });

  it("compact: иконка без текста, но с доступным именем", () => {
    const html = renderToStaticMarkup(<ThemeToggle compact />);

    expect(html).toContain('aria-label="Переключить тему"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("Тема: …");
    expect(mocks.setTheme).not.toHaveBeenCalled();
  });
});
