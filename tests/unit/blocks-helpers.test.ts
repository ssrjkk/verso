import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  DEFAULT_BLOCKS,
  defaultPropsJson,
  parseProps,
} from "@/components/blocks/block-defaults";
import { cn } from "@/lib/utils";

describe("block-defaults", () => {
  it("все типы имеют дефолты и подписи", () => {
    for (const type of BLOCK_TYPES) {
      expect(DEFAULT_BLOCKS[type]).toBeTypeOf("object");
      expect(BLOCK_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(BLOCK_TYPES).toHaveLength(8);
  });

  it("defaultPropsJson отдаёт pretty-JSON, который парсится обратно", () => {
    for (const type of BLOCK_TYPES) {
      const json = defaultPropsJson(type);
      expect(json).toContain("\n");
      expect(JSON.parse(json)).toEqual(DEFAULT_BLOCKS[type]);
    }
  });

  it("parseProps принимает объект", () => {
    expect(parseProps('{"title":"T"}', { title: "fallback" })).toEqual({ title: "T" });
  });

  it.each([
    ["битый JSON", "{oops"],
    ["массив", "[1,2]"],
    ["null", "null"],
    ["строка", '"text"'],
    ["число", "42"],
  ])("parseProps: %s -> fallback", (_name, input) => {
    const fallback = { title: "fallback" };
    expect(parseProps(input, fallback)).toBe(fallback);
  });

  it("parseProps сохраняет пустой объект (это валидный объект)", () => {
    expect(parseProps("{}", { title: "fallback" })).toEqual({});
  });
});

describe("cn", () => {
  it("объединяет условные классы", () => {
    expect(cn("px-2", false && "hidden", "py-1")).toBe("px-2 py-1");
  });

  it("разрешает конфликты tailwind в пользу последнего", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
