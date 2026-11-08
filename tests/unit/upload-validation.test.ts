import { describe, it, expect } from "vitest";
import { validateUploadFile, MAX_BYTES } from "@/lib/upload-validation";

// Файлы с корректной сигнатурой: контракт требует magic bytes,
// поэтому даже «метаданные-валидные» кейсы несут реальные заголовки.
function magicFor(name: string): Uint8Array<ArrayBuffer> {
  const b: Uint8Array<ArrayBuffer> = new Uint8Array(64);
  const ascii = (s: string, at: number) => {
    for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
  };
  if (name.toLowerCase().endsWith(".png")) b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  else if (name.toLowerCase().endsWith(".jpg")) b.set([0xff, 0xd8, 0xff, 0xe0], 0);
  else if (name.toLowerCase().endsWith(".pdf")) ascii("%PDF-1.7", 0);
  else if (name.toLowerCase().endsWith(".mp4")) ascii("ftyp", 4);
  return b;
}

const v = (name: string, type: string) => {
  const bytes = magicFor(name);
  return validateUploadFile(new File([bytes], name, { type }), bytes);
};

describe("upload validation (stored-XSS gate)", () => {
  it("принимает png/jpg/pdf/mp4 при совпадении mime и сигнатуры", () => {
    expect(v("a.png", "image/png")).toMatchObject({ ok: true, ext: "png" });
    expect(v("a.JPG", "image/jpeg")).toMatchObject({ ok: true, ext: "jpg" });
    expect(v("a.pdf", "application/pdf")).toMatchObject({ ok: true });
    expect(v("a.mp4", "video/mp4")).toMatchObject({ ok: true });
  });

  it("режет svg (скрипты в origin)", () => {
    const file = new File([new Uint8Array(64)], "x.svg", { type: "image/svg+xml" });
    expect(validateUploadFile(file, new Uint8Array(64)).ok).toBe(false);
  });

  it("режет html с подменой mime под картинку", () => {
    const html = new TextEncoder().encode("<html></html>" + " ".repeat(64));
    expect(validateUploadFile(new File([html], "x.html", { type: "image/png" }), html).ok).toBe(false);
    expect(validateUploadFile(new File([html], "x.html", { type: "text/html" }), html).ok).toBe(false);
  });

  it("режет js/exe/без расширения", () => {
    const z = new Uint8Array(64);
    expect(validateUploadFile(new File([z], "x.js", { type: "application/javascript" }), z).ok).toBe(false);
    expect(validateUploadFile(new File([z], "x.exe", { type: "application/octet-stream" }), z).ok).toBe(false);
    expect(validateUploadFile(new File([z], "noext", { type: "image/png" }), z).ok).toBe(false);
  });

  it("режет расхождение mime и расширения", () => {
    expect(v("a.png", "image/jpeg").ok).toBe(false);
    expect(v("a.jpg", "image/png").ok).toBe(false);
  });

  it("режет перевес и не-File", () => {
    const big: Uint8Array<ArrayBuffer> = new Uint8Array(MAX_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(validateUploadFile(new File([big], "a.png", { type: "image/png" }), big).ok).toBe(false);
    expect(validateUploadFile("nope", new Uint8Array(8)).ok).toBe(false);
    expect(validateUploadFile(null, new Uint8Array(8)).ok).toBe(false);
  });
});
