import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { slugify } from "@/lib/slug";
import { buildEntrySnapshot } from "@/lib/entry-snapshot";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const CreateBody = z.object({
  title: z.string().trim().min(1).max(300),
  slug: z.string().max(150).optional(),
  excerpt: z.string().max(5000).optional(),
  fieldsJson: z.string().max(200_000).optional(),
});

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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof (raw as { title?: unknown }).title !== "string" ||
    !(raw as { title: string }).title.trim()
  ) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Минимальный автор: первый ADMIN, иначе любой пользователь
  const author = await prisma.user.findFirst({ where: { role: "ADMIN" } }) ?? await prisma.user.findFirst();
  if (!author) return NextResponse.json({ error: "No users in system" }, { status: 500 });

  const finalSlug = slugify(body.slug || body.title) || "entry";
  try {
    // API-запись проходит те же инварианты, что и создание в CMS:
    // ревизия v1 + activity в одной транзакции.
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.entry.create({
        data: {
          collectionId: col.id,
          title: body.title,
          slug: finalSlug,
          excerpt: body.excerpt,
          fieldsJson: body.fieldsJson,
          authorId: author.id,
        },
      });
      await tx.revision.create({
        data: {
          entryId: created.id,
          version: 1,
          snapshotJson: buildEntrySnapshot(created),
          changeNote: "Создание через Headless API",
          authorId: author.id,
        },
      });
      await tx.activityLog.create({
        data: {
          entryId: created.id,
          userId: author.id,
          action: "CREATED",
          comment: "Создана через Headless API",
        },
      });
      return created;
    });
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Slug already exists in collection" }, { status: 409 });
    }
    console.error("[api/v1] entry.create failed:", e);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}
