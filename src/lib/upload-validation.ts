// Строгая валидация загрузок: никаких доверенных клиентских mime,
// соответствие расширение<->mime, запрет исполняемого контента.
export const MAX_BYTES = 10 * 1024 * 1024;

// Разрешённые пары расширение -> точный mime. SVG/HTML/JS запрещены
// осознанно: image/svg+xml исполняет скрипты в origin CMS (stored XSS).
const ALLOWED: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function validateUploadFile(file: unknown): { ok: true; ext: string } | { ok: false; error: string } {
  if (typeof File !== "undefined" && !(file instanceof File)) {
    return { ok: false, error: "Поле file обязательно" };
  }
  const f = file as { name?: unknown; type?: unknown; size?: unknown };
  const name = typeof f.name === "string" ? f.name : "";
  const mime = typeof f.type === "string" ? f.type : "";
  const size = typeof f.size === "number" ? f.size : 0;

  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().slice(0, 10) : "";
  const expected = ALLOWED[ext];
  if (!expected) {
    return { ok: false, error: `Недопустимое расширение: .${ext || "(нет)"}` };
  }
  if (mime !== expected) {
    return { ok: false, error: `MIME ${mime || "unknown"} не соответствует расширению .${ext}` };
  }
  if (size > MAX_BYTES) {
    return { ok: false, error: "Файл больше 10MB" };
  }
  return { ok: true, ext };
}
