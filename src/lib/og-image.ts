// OG-картинка приходит из формы, поэтому в <img src> попадают только http(s)
// адреса и пути того же origin. Схемы (javascript:, data:, file:, blob:) и
// протокол-относительные //host отсекаются; пробелы и обратные косые — тоже,
// браузеры нормализуют их в чужие хосты.
export function safeImageUrl(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || /[\s\\]/.test(raw)) return "";
  if (raw.startsWith("/")) return /^\/[^/]/.test(raw) ? raw : "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}
