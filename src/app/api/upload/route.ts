import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateUploadFile } from "@/lib/upload-validation";

function sanitizeFolder(folder: string | null): string {
  const f = (folder ?? "root").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "root";
  return f.slice(0, 40);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const verdict = validateUploadFile(file);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 400 });
  }
  const filename = `${randomUUID()}.${verdict.ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buf);

  const asset = await prisma.mediaAsset.create({
    data: {
      filename: file.name || filename,
      url: `/uploads/${folder}/${filename}`,
      mimeType: file.type,
      sizeBytes: file.size,
      width: null,
      height: null,
      altText,
      folder,
    },
  });
  return NextResponse.json({ asset }, { status: 201 });
}
