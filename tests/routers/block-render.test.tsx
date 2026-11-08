import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BlockRender, { asSafeHref } from "@/components/blocks/BlockRender";
import { DEFAULT_BLOCKS, type BlockType } from "@/components/blocks/block-defaults";

const EXPECTED: Record<BlockType, string[]> = {
  HERO: ["Новый раздел", "Подробнее", "Заголовок страницы"],
  FEATURES: ["Наши преимущества", "Быстрый старт"],
  PRICING: ["Тарифы", "Старт"],
  FAQ: ["Частые вопросы", "Что такое Verso?"],
  RICH_TEXT: ["О разделе"],
  GALLERY: ["Галерея", "picsum.photos"],
  CODE: ["Пример кода", "typescript", "hello"],
  CTA: ["Готовы начать?", "Создать запись"],
};

// Регрессия на класс бага «молчаливый фолбэк»: каждый тип обязан
// отрендерить свои дефолтные данные, а не только заглушки.
describe("BlockRender: все 8 типов рисуют контент", () => {
  (Object.keys(EXPECTED) as BlockType[]).forEach((type) => {
    it(`${type} renders defaults`, () => {
      const html = renderToStaticMarkup(
        <BlockRender type={type} propsJson={JSON.stringify(DEFAULT_BLOCKS[type])} />,
      );
      for (const needle of EXPECTED[type]) {
        expect(html, `${type} should contain ${JSON.stringify(needle)}`).toContain(needle);
      }
    });
  });

  it("HERO с пустыми пропсами показывает только фолбэк-заголовок", () => {
    const html = renderToStaticMarkup(<BlockRender type="HERO" propsJson="{}" />);
    expect(html).toContain("Заголовок");
    expect(html).not.toContain("Новая страница");
  });

  it("неизвестный тип не падает", () => {
    const html = renderToStaticMarkup(<BlockRender type="NOPE" propsJson="{}" />);
    expect(html).toContain("NOPE");
  });
});

describe("asSafeHref: режем javascript:/data:/vbscript:", () => {
  it.each([
    ["javascript:alert(1)", "#"],
    ["JaVaScRiPt:alert(1)", "#"],
    ["data:text/html,<h1>x</h1>", "#"],
    ["vbscript:msgbox(1)", "#"],
    ["", "#"],
  ])("блокирует %s", (input, expected) => {
    expect(asSafeHref(input)).toBe(expected);
  });

  it.each([
    "https://example.com/x",
    "http://example.com/",
    "/collections/posts",
    "#section",
    "mailto:a@b.c",
    "tel:+70000000000",
  ])("пропускает %s", (input) => {
    expect(asSafeHref(input)).toBe(input);
  });

  it("CTA с javascript-ссылкой рендерит #", () => {
    const html = renderToStaticMarkup(
      <BlockRender type="CTA" propsJson={JSON.stringify({ title: "T", text: "x", buttonLabel: "Go", buttonHref: "javascript:alert(1)" })} />,
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });
});
