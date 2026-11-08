import { describe, it, expect } from "vitest";
import { validateUploadFile, MAX_BYTES } from "@/lib/upload-validation";

const f = (name: string, type: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type });

describe("upload validation (stored-XSS gate)", () => {
  it("принимает png/jpg/pdf/mp4 при совпадении mime", () => {
    expect(validateUploadFile(f("a.png", "image/png"))).toMatchObject({ ok: true, ext: "png" });
    expect(validateUploadFile(f("a.JPG", "image/jpeg"))).toMatchObject({ ok: true, ext: "jpg" });
    expect(validateUploadFile(f("a.pdf", "application/pdf"))).toMatchObject({ ok: true });
    expect(validateUploadFile(f("a.mp4", "video/mp4"))).toMatchObject({ ok: true });
  });

  it("режет svg (скрипты в origin)", () => {
    const r = validateUploadFile(f("x.svg", "image/svg+xml"));
    expect(r.ok).toBe(false);
  });

  it("режет html с подменой mime под картинку", () => {
    expect(validateUploadFile(f("x.html", "image/png")).ok).toBe(false);
    expect(validateUploadFile(f("x.html", "text/html")).ok).toBe(false);
  });

  it("режет js/exe/без расширения", () => {
    expect(validateUploadFile(f("x.js", "application/javascript")).ok).toBe(false);
    expect(validateUploadFile(f("x.exe", "application/octet-stream")).ok).toBe(false);
    expect(validateUploadFile(f("noext", "image/png")).ok).toBe(false);
  });

  it("режет расхождение mime и расширения", () => {
    expect(validateUploadFile(f("a.png", "image/jpeg")).ok).toBe(false);
    expect(validateUploadFile(f("a.jpg", "image/png")).ok).toBe(false);
  });

  it("режет перевес и не-File", () => {
    expect(validateUploadFile(f("a.png", "image/png", MAX_BYTES + 1)).ok).toBe(false);
    expect(validateUploadFile("nope").ok).toBe(false);
    expect(validateUploadFile(null).ok).toBe(false);
  });
});
