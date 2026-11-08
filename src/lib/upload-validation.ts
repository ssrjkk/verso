// Строгая валидация загрузок: magic bytes сигнатуры, соответствие
// расширение<->mime, запрет исполняемого контента, лимит размера.
// Сигнатура проверяется ВСЕГДА: bytes обязателен (маршрут /api/upload
// передаёт реальные байты файла). Метаданных File недостаточно —
// расширение и MIME подделываются одной строкой.
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

function hasMagic(bytes: Uint8Array, ext: string): boolean {
  const ascii = (at: number, s: string) => {
    if (bytes.length < at + s.length) return false;
    for (let i = 0; i < s.length; i++) {
      if (bytes[at + i] !== s.charCodeAt(i)) return false;
    }
    return true;
  };
  const head = (n: number[]) => {
    if (bytes.length < n.length) return false;
    return n.every((v, i) => bytes[i] === v);
  };
  switch (ext) {
    case "png":
      return head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return head([0xff, 0xd8, 0xff]);
    case "gif":
      return ascii(0, "GIF87a") || ascii(0, "GIF89a");
    case "webp":
      // RIFF....WEBP: контейнер WebP, а не произвольный RIFF (AVI/WAV).
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "avif":
      // ftyp + бренд avif: обычный mp4-ftyp не проходит под видом avif.
      return ascii(4, "ftyp") && ascii(8, "avif");
    case "pdf":
      return ascii(0, "%PDF-");
    case "mp4":
      return ascii(4, "ftyp");
    case "webm":
      return head([0x1a, 0x45, 0xdf, 0xa3]);
    default:
      return false;
  }
}

export function validateUploadFile(
  file: unknown,
  bytes: Uint8Array | undefined,
): { ok: true; ext: string } | { ok: false; error: string } {
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
  // Сигнатура — последний рубеж: без байтов проверять нечего → отказ.
  if (!bytes || !hasMagic(bytes, ext)) {
    return { ok: false, error: `Содержимое не соответствует формату .${ext}` };
  }
  return { ok: true, ext };
}

// Имя файла на диске — всегда server-generated (randomUUID в маршруте),
// в БД хранится оригинальное имя только для отображения. Прямое создание
// записей (media.create) обязано ссылаться на такой же сгенерированный URL.
const MANAGED_URL = /^\/uploads\/[a-z0-9_-]{1,40}\/[0-9a-f-]{1,64}\.(png|jpg|jpeg|webp|gif|avif|pdf|mp4|webm)$/;

/** Проверка прямой записи медиатеки. null — запись допустима. */
export function mediaCreateIssue(input: {
  url: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (!MANAGED_URL.test(input.url)) {
    return "url обязан указывать на файл из /uploads (загрузка через /api/upload)";
  }
  const ext = input.url.slice(input.url.lastIndexOf(".") + 1).toLowerCase();
  if (ALLOWED[ext] !== input.mimeType) {
    return `MIME ${input.mimeType} не соответствует расширению .${ext}`;
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0 || input.sizeBytes > MAX_BYTES) {
    return `sizeBytes вне диапазона 0..${MAX_BYTES}`;
  }
  return null;
}
