import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OgPreview from "@/components/seo/OgPreview";

const BASE = { title: "Заголовок", description: "Описание", url: "example.com/p" };
type Props = Parameters<typeof OgPreview>[0];

function markup(props: Partial<Props>) {
  return renderToStaticMarkup(<OgPreview {...BASE} {...props} />);
}

describe("OgPreview: og-image", () => {
  it("renders an absolute http(s) url", () => {
    expect(markup({ image: "https://cdn.example.com/a.png" })).toContain(
      'src="https://cdn.example.com/a.png"',
    );
  });

  it("adds the scheme when the field has none", () => {
    expect(markup({ image: "cdn.example.com/a.png" })).toContain(
      'src="https://cdn.example.com/a.png"',
    );
  });

  // Ключевое: в src не попадают схемы, которые браузер исполняет, и чужой host.
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "//evil.example/a.png",
    "/\\evil.example/a.png",
    "https://",
  ]) {
    it(`drops ${bad.slice(0, 24)}`, () => {
      const html = markup({ image: bad });
      expect(html).not.toContain("<img");
      expect(html).toContain("Нет og-изображения");
    });
  }

  // Загруженные в саму панель картинки хранятся путями того же origin.
  it("keeps same-origin paths", () => {
    expect(markup({ image: "/uploads/og/ab12cd.png" })).toContain('src="/uploads/og/ab12cd.png"');
  });

  it("escapes meta-characters in the title instead of reinterpreting them", () => {
    const html = markup({ title: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
