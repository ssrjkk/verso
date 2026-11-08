import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { slugify } from "@/lib/slug";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// Лимиты Headless API: 240 запросов/минуту на IP. Щедро для интеграций и
// e2e, но режет флуд и перебор ключей (fail-closed 429, не тихий дроп).
const V1_CAPACITY = 240;
const V1_WINDOW_MS = 60_000;

// lastUsedAt — телеметрия, а не часы: перезапись не чаще раза в минуту,
// чтобы каждый GET не дёргал строку ключа.
const TOUCH_THROTTLE_MS = 60_000;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function extractRawKey(req: NextRequest): string | null {
  // Только заголовки. ?key= удалён осознанно: ключ в query оседает
  // в логах прокси/CDN и истории браузера.
  const header = req.headers.get("x-api-key")?.trim();
  if (header) return header;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer (.+)$/i.exec(auth);
  return match ? match[1].trim() : null;
}

async function checkKey(req: NextRequest) {
  const raw = extractRawKey(req);
  if (!raw) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return "expired" as const;
  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > TOUCH_THROTTLE_MS) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } });
  }
  return key;
}

function limited(req: NextRequest) {
  const verdict = checkRateLimit(`v1:${clientIp(req)}`, {
    capacity: V1_CAPACITY,
    windowMs: V1_WINDOW_MS,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: rateLimitHeaders(verdict.retryAfterMs),
    });
  }
  return null;
}

function canWrite(scope: string) {
  return scope === "READ_WRITE";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const hit = limited(req);
  if (hit) return hit;
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
  const hit = limited(req);
  if (hit) return hit;
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
