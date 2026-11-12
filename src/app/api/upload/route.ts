import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  MAX_BYTES,
  MAX_REQUEST_BYTES,
  validateUploadFile,
} from "@/lib/upload-validation";
import { removeManagedUpload } from "@/lib/media-files";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// Загрузки — дорогая операция (диск + БД): 60/минуту на пользователя.
// Отдельный бюджет от Headless API, чтобы импорт медиа не душил интеграции.
const UPLOAD_CAPACITY = 60;
const UPLOAD_WINDOW_MS = 60_000;

function identityOf(req: NextRequest, userId: string | undefined): string {
  if (userId) return `upload:user:${userId}`;
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
  return `upload:ip:${ip}`;
}

function sanitizeFolder(folder: string | null): string {
  const f = (folder ?? "root").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "root";
  return f.slice(0, 40);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const role = (session?.user as { id?: string; role?: string } | undefined)?.role;
  if (!session || role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const verdict = checkRateLimit(
    identityOf(req, (session.user as { id?: string }).id),
    { capacity: UPLOAD_CAPACITY, windowMs: UPLOAD_WINDOW_MS },
  );
  if (!verdict.ok) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: rateLimitHeaders(verdict.retryAfterMs),
    });
  }
  // Отсекаем гигантский запрос до formData(): иначе 10 MB-лимит не спасает
  // от чтения произвольного тела в память.
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Файл больше 10MB" }, { status: 413 });
    }
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const folder = sanitizeFolder(form.get("folder")?.toString() ?? null);
  const altText = form.get("altText")?.toString().slice(0, 500) ?? "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Поле file обязательно" }, { status: 400 });
  }
  // Размер известен из метаданных File: не читаем тело, если он уже превышен.
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл больше 10MB" }, { status: 413 });
  }
  // Байты читаем один раз: и для magic-check, и для записи на диск.
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Файл больше 10MB" }, { status: 413 });
  }
  const check = validateUploadFile(file, new Uint8Array(buf));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  const filename = `${randomUUID()}.${check.ext}`;
  const url = `/uploads/${folder}/${filename}`;
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        filename: file.name || filename,
        url,
        mimeType: file.type,
        sizeBytes: buf.byteLength,
        width: null,
        height: null,
        altText,
        folder,
      },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (e) {
    // Файл уже на диске: без уборки он навсегда останется сиротой.
    console.error("[upload] mediaAsset.create failed:", e);
    await removeManagedUpload(url);
    return NextResponse.json({ error: "Не удалось сохранить файл" }, { status: 500 });
  }
}
