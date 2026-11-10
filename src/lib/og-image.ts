// OG-картинка приходит из формы, поэтому в <img src> попадают только http(s)
// адреса и пути того же origin. Схемы (javascript:, data:, file:, blob:) и
// протокол-относительные //host отсекаются; пробелы и обратные косые тоже —
// браузеры нормализуют их в чужие хосты.
const SAME_ORIGIN = "http://og.invalid";

export function safeImageUrl(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || /[\s\\]/.test(raw)) return "";
  if (raw.startsWith("//")) return "";
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const candidate = hasScheme ? raw : raw.startsWith("/") ? new URL(raw, SAME_ORIGIN).href : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (raw.startsWith("/")) return parsed.origin === SAME_ORIGIN ? parsed.pathname : "";
  return parsed.href;
}
