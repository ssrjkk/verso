import { describe, expect, it } from "vitest";
import { dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/datetime";

describe("datetime-local ↔ ISO", () => {
  it("пустые значения не создают дату", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
    expect(toDateTimeLocalValue(undefined)).toBe("");
    expect(toDateTimeLocalValue("")).toBe("");
    expect(toDateTimeLocalValue("not-a-date")).toBe("");
    expect(dateTimeLocalToIso("")).toBeNull();
    expect(dateTimeLocalToIso("   ")).toBeNull();
  });

  it("показывает локальное время без UTC-среза", () => {
    // Конструктор с компонентами — локальное время в любой TZ.
    const local = new Date(2026, 5, 1, 12, 34);
    expect(toDateTimeLocalValue(local)).toBe("2026-06-01T12:34");
  });

  it("интерпретирует ввод как локальное время и отправляет UTC ISO", () => {
    const iso = dateTimeLocalToIso("2026-06-01T12:34");
    expect(iso).toMatch(/^2026-06-01T\d{2}:34:00\.000Z$/);
    const parsed = new Date(iso as string);
    expect(parsed.getHours()).toBe(12);
    expect(parsed.getMinutes()).toBe(34);
  });

  it("round-trip сохраняет минуты независимо от часового пояса", () => {
    const value = "2027-02-03T04:05";
    expect(toDateTimeLocalValue(dateTimeLocalToIso(value))).toBe(value);
  });

  it("некорректная дата — ошибка, а не тихая очистка расписания", () => {
    expect(() => dateTimeLocalToIso("2026-02-31T99:99")).toThrow("Некорректная дата");
  });
});
