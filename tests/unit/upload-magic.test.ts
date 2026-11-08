import { describe, it, expect } from "vitest";
import { validateUploadFile, MAX_BYTES } from "@/lib/upload-validation";

// Минимальные корректные заголовки по типам (остальное тело — нули).
function bytesFor(ext: string, size = 64): Uint8Array {
  const b = new Uint8Array(size);
  const ascii = (s: string, at: number) => {
    for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
  };
  switch (ext) {
    case "png":
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      break;
    case "jpg":
      b.set([0xff, 0xd8, 0xff, 0xe0], 0);
      break;
    case "gif":
      ascii("GIF89a", 0);
      break;
    case "webp":
      ascii("RIFF", 0);
      b.set([size, 0, 0, 0], 4);
      ascii("WEBP", 8);
      break;
    case "pdf":
      ascii("%PDF-1.7", 0);
      break;
    case "mp4":
      ascii("ftyp", 4);
      ascii("isom", 8);
      break;
    case "avif":
      ascii("ftyp", 4);
      ascii("avif", 8);
      break;
    case "webm":
      b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
      break;
  }
  return b;
}

const f = (name: string, type: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type });

describe("upload magic bytes (контракт: сигнатура обязана совпадать)", () => {
  it.each(["png", "jpg", "gif", "webp", "pdf", "mp4", "avif", "webm"])(
    "принимает .%s с корректной сигнатурой",
    (ext) => {
      const mime =
        ext === "jpg" ? "image/jpeg" : ext === "pdf" ? "application/pdf" : ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "avif" ? "image/avif" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
      expect(validateUploadFile(f(`a.${ext}`, mime), bytesFor(ext)).ok).toBe(true);
    },
  );

  it("режет png с нулевым/текстовым содержимым (подмена под картинку)", () => {
    const zeros = new Uint8Array(64);
    expect(validateUploadFile(f("a.png", "image/png"), zeros).ok).toBe(false);
    const text = new TextEncoder().encode("<html><script>alert(1)</script>" + " ".repeat(64));
    expect(validateUploadFile(f("a.png", "image/png"), text).ok).toBe(false);
  });

  it("режет перепутанные сигнатуры (pdf внутри .png, png внутри .pdf)", () => {
    expect(validateUploadFile(f("a.png", "image/png"), bytesFor("pdf")).ok).toBe(false);
    expect(validateUploadFile(f("a.pdf", "application/pdf"), bytesFor("png")).ok).toBe(false);
    expect(validateUploadFile(f("a.jpg", "image/jpeg"), bytesFor("gif")).ok).toBe(false);
  });

  it("режет усечённый файл короче сигнатуры", () => {
    expect(validateUploadFile(f("a.png", "image/png"), new Uint8Array(3)).ok).toBe(false);
  });

  it("без байтов сигнатуру не проверить — отказ, а не пропуск", () => {
    expect(validateUploadFile(f("a.png", "image/png"), undefined).ok).toBe(false);
  });

  it("лимиты размера действуют вместе с magic check", () => {
    const big = bytesFor("png", MAX_BYTES + 1);
    expect(validateUploadFile(f("a.png", "image/png", MAX_BYTES + 1), big).ok).toBe(false);
  });
});
