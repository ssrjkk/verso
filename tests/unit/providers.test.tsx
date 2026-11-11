import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Providers } from "@/app/providers";

describe("Providers", () => {
  it("оборачивает дерево trpc + react-query и рендерит детей", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <span data-testid="child">дочерний узел</span>
      </Providers>,
    );

    expect(html).toContain("дочерний узел");
  });
});
