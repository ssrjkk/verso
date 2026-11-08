import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const PROTECTED = [
  "/dashboard",
  "/collections",
  "/board",
  "/media",
  "/calendar",
  "/seo",
  "/settings",
  "/entries",
];

// Эти префиксы не участвуют в SEO-редиректах: API/ассеты отдаются как есть.
const NON_REDIRECT_PREFIXES = ["/api", "/_next", "/uploads"];

function hasSessionCookie(req: NextRequest): boolean {
  const direct =
    req.cookies.get("better-auth.session_token") ??
    req.cookies.get("__Secure-better-auth.session_token");
  if (direct?.value) return true;
  return req.cookies
    .getAll()
    .some((c) => c.name.includes("better-auth.session_token") && Boolean(c.value));
}

function isSafeRelativeTarget(toPath: string): boolean {
  if (!toPath.startsWith("/") || toPath.startsWith("//") || toPath.includes("\\")) {
    return false;
  }
  // Defense in depth: даже если в БД лежит легаси-строка, служебные цели не отдаём.
  const pathname = toPath.split(/[?#]/, 1)[0];
  for (const prefix of ["/api", "/_next"] as const) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return false;
  }
  return true;
}

/**
 * Proxy (Node.js runtime) исполняет SEO-редиректы до рендера:
 * точный матч pathname, только активные записи, 301/302.
 * `hits` инкрементится здесь же одним атомарным UPDATE — публичной mutation
 * накрутки счётчика больше нет.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const canServeRedirect =
    (req.method === "GET" || req.method === "HEAD") &&
    !NON_REDIRECT_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

  if (canServeRedirect) {
    try {
      const redirect = await prisma.redirect.findUnique({
        where: { fromPath: pathname },
        select: { toPath: true, statusCode: true, isActive: true },
      });
      if (
        redirect?.isActive &&
        redirect.toPath !== pathname &&
        isSafeRelativeTarget(redirect.toPath)
      ) {
        // Атомарный SQL `hits = hits + 1`: параллельные запросы не теряют клики.
        await prisma.redirect
          .update({ where: { fromPath: pathname }, data: { hits: { increment: 1 } } })
          .catch(() => undefined);
        const status = redirect.statusCode === 302 ? 302 : 301;
        return NextResponse.redirect(new URL(redirect.toPath, req.nextUrl), status);
      }
    } catch {
      // БД недоступна — страница должна открыться, а не упасть из-за редиректов.
    }
  }

  return NextResponse.next();
}

export const config = {
  // Все страницы, кроме API, служебных ассетов и файлов с расширением.
  // Авторизация по-прежнему применяется только к PROTECTED внутри функции.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads/|.*\\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf|otf|mp4|pdf|xml|txt)$).*)",
  ],
};
