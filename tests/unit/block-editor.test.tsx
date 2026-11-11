import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BlockEditor from "@/components/blocks/BlockEditor";

const CASES: Array<[string, string, Record<string, unknown>]> = [
  ["HERO", "Плашка (eyebrow)", { title: "T" }],
  ["CTA", "Текст кнопки", { title: "T" }],
  ["RICH_TEXT", "Текст (пустая строка — новый абзац)", { title: "T" }],
  ["CODE", "Код", { title: "T" }],
  ["FEATURES", "Элементы (items)", { title: "T", items: [] }],
  ["PRICING", "Тарифы (plans)", { title: "T", plans: [] }],
  ["FAQ", "Вопросы (items)", { title: "T", items: [] }],
  ["GALLERY", "Изображения (images)", { title: "T", images: [] }],
  ["CUSTOM", "Свойства блока (JSON)", { title: "T" }],
];

describe("BlockEditor: рендер по типу блока", () => {
  it.each(CASES)("%s: показывает поле «%s»", (type, label, value) => {
    const html = renderToStaticMarkup(
      <BlockEditor type={type} value={value} onChange={() => undefined} />,
    );

    expect(html).toContain(label);
    expect(html).toContain("T");
    expect(html).toMatch(/<(input|textarea)/);
  });

  it("неизвестный тип: JSON-редактор с сериализованными свойствами", () => {
    const html = renderToStaticMarkup(
      <BlockEditor type="CUSTOM" value={{ title: "T", flag: true }} onChange={() => undefined} />,
    );

    expect(html).toContain("Свойства блока (JSON)");
    expect(html).toContain("&quot;flag&quot;: true");
    expect(html).toContain("Применить JSON");
    expect(html).toContain("Сбросить к дефолту");
  });
});
