/**
 * Валидация SEO-редиректов.
 *
 * Правила (закрывают open redirect, тень на служебных путях и петли):
 * - fromPath/toPath — только относительные пути, начинающиеся с одного `/`;
 * - `//host` и `/\host` запрещены (браузер трактует их как внешний хост);
 * - служебные префиксы `/api`, `/_next` запрещены с обеих сторон;
 *   `/uploads`, `/sign-in`, `/sign-up` нельзя перекрывать как источник;
 * - цепочка исполняемых редиректов — не длиннее MAX_REDIRECT_CHAIN;
 * - циклы запрещены.
 *
 * Проверка цепочки ведётся по активным рёбрам: выключенный редирект не
 * исполняется, значит и цепочку не продолжает.
 */

export const MAX_REDIRECT_CHAIN = 3;
export const REDIRECT_STATUS_CODES = [301, 302] as const;
export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number];

export type RedirectEdge = { fromPath: string; toPath: string };

const MAX_FROM_LENGTH = 512;
const MAX_TO_LENGTH = 2048;

const BOTH_FORBIDDEN = ["/api", "/_next"] as const;
const SOURCE_FORBIDDEN = ["/uploads", "/sign-in", "/sign-up"] as const;

function servicePathReason(path: string, kind: "fromPath" | "toPath"): string | null {
  const prefixes = kind === "fromPath" ? [...BOTH_FORBIDDEN, ...SOURCE_FORBIDDEN] : BOTH_FORBIDDEN;
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `служебный путь ${prefix} запрещён`;
    }
  }
  return null;
}

/** Синтаксическая проверка одного пути. null — путь допустим. */
export function redirectPathIssue(raw: string, kind: "fromPath" | "toPath"): string | null {
  if (!raw.startsWith("/")) return `${kind}: путь должен начинаться с "/"`;
  if (raw.startsWith("//")) return `${kind}: protocol-relative URL запрещён`;
  if (raw.includes("\\")) return `${kind}: обратный слэш запрещён`;
  if (raw.length > (kind === "fromPath" ? MAX_FROM_LENGTH : MAX_TO_LENGTH)) {
    return `${kind}: путь слишком длинный`;
  }
  if (/[\s\x00-\x1f\x7f]/.test(raw)) return `${kind}: пробелы и control-символы запрещены`;
  if (kind === "fromPath" && /[?#]/.test(raw)) {
    return "fromPath: query/hash не входят в pathname";
  }
  if (kind === "fromPath" && raw.length > 1 && raw.endsWith("/")) {
    return "fromPath: завершающий слэш не нормализуется";
  }
  const pathname = raw.split(/[?#]/, 1)[0];
  const service = servicePathReason(pathname, kind);
  if (service) return `${kind}: ${service}`;
  return null;
}

/**
 * Полная проверка upsert'а: синтаксис обоих путей + петли/длина цепочки.
 * `existingActive` — только активные рёбра; ребро с тем же fromPath исключается,
 * потому что upsert его заменяет.
 */
export function validateRedirect(
  fromPath: string,
  toPath: string,
  existingActive: readonly RedirectEdge[],
): string | null {
  const fromIssue = redirectPathIssue(fromPath, "fromPath");
  if (fromIssue) return fromIssue;
  const toIssue = redirectPathIssue(toPath, "toPath");
  if (toIssue) return toIssue;
  if (fromPath === toPath) return "Редирект на себя запрещён";

  const graph = new Map<string, string>();
  for (const edge of existingActive) {
    if (edge.fromPath !== fromPath) graph.set(edge.fromPath, edge.toPath);
  }
  graph.set(fromPath, toPath);

  // Полная длина цепочки через новое ребро: обходим вперёд из каждой вершины.
  // Так ловим и циклы, и цепочки, чья «задняя» часть уже лежит в графе
  // (например a→b→c→d существует, добавляем d→e — итог 4 хопа).
  const starts = new Set<string>(graph.keys());
  for (const target of graph.values()) starts.add(target);
  for (const start of starts) {
    let current: string | undefined = start;
    const seen = new Set<string>();
    let hops = 0;
    while (current !== undefined) {
      if (seen.has(current)) return "Цикл редиректов запрещён";
      seen.add(current);
      const next = graph.get(current);
      if (next === undefined) break;
      hops += 1;
      if (hops > MAX_REDIRECT_CHAIN) {
        return `Цепочка длиннее ${MAX_REDIRECT_CHAIN} редиректов запрещена`;
      }
      current = next;
    }
  }
  return null;
}
