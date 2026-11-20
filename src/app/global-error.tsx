"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // global-error заменяет root layout целиком — поэтому свои html/body.
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#17150f",
          color: "#f2ede2",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <main>
          <p
            style={{
              color: "#e8a58c",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: 12,
            }}
          >
            Ошибка
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0.5rem 0" }}>
            Приложение недоступно
          </h1>
          <p style={{ color: "#b7af9f", maxWidth: 420 }}>
            Произошла критическая ошибка. Попробуйте перезагрузить страницу.
          </p>
          <div
            style={{
              marginTop: "1rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#8f2c1f",
                color: "#fff",
                border: 0,
                borderRadius: 2,
                padding: "0.65rem 1.1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Повторить
            </button>
            {/* global-error заменяет root layout: полная навигация надёжнее
                клиентского Link, если router-контекст уже недоступен. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: "1px solid rgba(244,240,230,0.25)",
                color: "#f2ede2",
                borderRadius: 2,
                padding: "0.65rem 1.1rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              На главную
            </a>
          </div>
          {process.env.NODE_ENV !== "production" && error?.digest ? (
            <p style={{ marginTop: "1rem", color: "#8a8172", fontSize: 12 }}>
              digest: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
