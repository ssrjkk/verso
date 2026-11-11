import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "@/app/page";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";

describe("статические страницы и error boundaries", () => {
  it("лендинг: hero, шесть модулей, стек и CTA", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("Verso — контент");
    expect(html).toContain("Шесть модулей из коробки");
    for (const title of [
      "Конструктор страниц",
      "Коллекции",
      "Медиатека",
      "SEO-инспектор",
      "Headless API",
      "Вебхуки и ревизии",
    ]) {
      expect(html).toContain(title);
    }
    expect(html).toContain("Next.js 16");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/sign-in"');
  });

  it("404: сообщение и ссылка на главную", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("404");
    expect(html).toContain("Страница не найдена");
    expect(html).toContain("Такой страницы нет");
    expect(html).toContain('href="/"');
  });

  it("error boundary: повтор, ссылка и никаких деталей ошибки", () => {
    const html = renderToStaticMarkup(
      <ErrorPage error={new Error("internal secret")} reset={() => undefined} />,
    );

    expect(html).toContain("Что-то пошло не так");
    expect(html).toContain("Повторить");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("internal secret");
  });

  it("global-error: полный html/body, кнопки и digest вне production", () => {
    const error = Object.assign(new Error("boom"), { digest: "digest-1" });
    const html = renderToStaticMarkup(<GlobalError error={error} reset={() => undefined} />);

    expect(html).toContain("<html");
    expect(html).toContain('lang="ru"');
    expect(html).toContain("Приложение недоступно");
    expect(html).toContain("Повторить");
    expect(html).toContain("digest: digest-1");
  });

  it("global-error: без digest строка диагностики не рендерится", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("boom")} reset={() => undefined} />,
    );

    expect(html).toContain("Приложение недоступно");
    expect(html).not.toContain("digest:");
  });
});
