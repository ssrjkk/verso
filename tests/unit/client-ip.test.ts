import { describe, expect, it } from "vitest";
import { getClientIp, trustedProxyHops } from "@/lib/client-ip";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("trustedProxyHops", () => {
  it("по умолчанию доверяет одному прокси", () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops("")).toBe(1);
    expect(trustedProxyHops("  ")).toBe(1);
  });

  it("принимает 0..10 без дробей", () => {
    expect(trustedProxyHops("0")).toBe(0);
    expect(trustedProxyHops("2")).toBe(2);
    expect(trustedProxyHops("10")).toBe(10);
  });

  it("некорректное значение откатывается к одному прокси", () => {
    for (const raw of ["-1", "1.5", "11", "abc", "Infinity"]) {
      expect(trustedProxyHops(raw)).toBe(1);
    }
  });
});

describe("getClientIp", () => {
  it("один прокси: берёт адрес, добавленный прокси, а не поддельный префикс", () => {
    expect(
      getClientIp(
        headers({ "x-forwarded-for": "198.51.100.9, 203.0.113.7" }),
        1,
      ),
    ).toBe("203.0.113.7");
  });

  it("два прокси: клиент на расстоянии hops от конца цепочки", () => {
    expect(
      getClientIp(
        headers({
          "x-forwarded-for": "198.51.100.9, 203.0.113.7, 10.0.0.1",
        }),
        2,
      ),
    ).toBe("203.0.113.7");
  });

  it("hops=0: пересылаемые заголовки игнорируются", () => {
    expect(
      getClientIp(
        headers({
          "x-forwarded-for": "203.0.113.7",
          "x-real-ip": "203.0.113.8",
        }),
        0,
      ),
    ).toBe("direct");
  });

  it("цепочка короче настроенного числа прокси -> unknown", () => {
    expect(
      getClientIp(headers({ "x-forwarded-for": "203.0.113.7" }), 2),
    ).toBe("unknown");
  });

  it("невалидный адрес не становится ключом лимита", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "not-an-ip" }), 1)).toBe(
      "unknown",
    );
    expect(getClientIp(headers({ "x-real-ip": "evil" }), 1)).toBe("unknown");
  });

  it("x-real-ip используется только при отсутствии x-forwarded-for", () => {
    expect(getClientIp(headers({ "x-real-ip": "203.0.113.5" }), 1)).toBe(
      "203.0.113.5",
    );
    expect(getClientIp(headers({}), 1)).toBe("unknown");
  });

  it("пробелы вокруг элементов цепочки не меняют результат", () => {
    expect(
      getClientIp(
        headers({ "x-forwarded-for": " 198.51.100.9 ,  203.0.113.7  " }),
        1,
      ),
    ).toBe("203.0.113.7");
  });
});
