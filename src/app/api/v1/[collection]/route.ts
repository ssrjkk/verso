import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { slugify } from "@/lib/slug";

async function checkKey(req: NextRequest) {
  const header = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("key");
  if (!header) return null;
  const hash = createHash("sha256").update(header).digest("hex");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return "expired" as const;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}

function canWrite(scope: string) {
  return scope === "READ_WRITE";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  const key = await checkKey(req);
  if (key === "expired") return NextResponse.json({ error: "API key expired" }, { status: 403 });
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = await prisma.entry.findMany({
    where: { collection: { slug: collection }, status: "PUBLISHED" },
    include: { blocks: { orderBy: { order: "asc" } }, tags: { include: { tag: true } } },
    orderBy: { publishedAt: "desc" },
  });
  return NextResponse.json({ data: entries });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const { collection: slug } = await params;
  const key = await checkKey(req);
  if (key === "expired") return NextResponse.json({ error: "API key expired" }, { status: 403 });
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(key.scope)) return NextResponse.json({ error: "Forbidden: READ_WRITE scope required" }, { status: 403 });

  const col = await prisma.collection.findUnique({ where: { slug } });
  if (!col) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  let body: { title?: string; slug?: string; excerpt?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // Минимальный автор: первый ADMIN, иначе любой пользователь
  const author = await prisma.user.findFirst({ where: { role: "ADMIN" } }) ?? await prisma.user.findFirst();
  if (!author) return NextResponse.json({ error: "No users in system" }, { status: 500 });

  const finalSlug = body.slug ? slugify(body.slug) : slugify(body.title);
  try {
    const entry = await prisma.entry.create({
      data: {
        collectionId: col.id,
        title: body.title,
        slug: finalSlug,
        excerpt: body.excerpt,
        authorId: author.id,
      },
    });
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Slug already exists in collection" }, { status: 409 });
  }
}
