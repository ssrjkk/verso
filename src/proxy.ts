import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

function hasSessionCookie(req: NextRequest): boolean {
  const direct =
    req.cookies.get("better-auth.session_token") ??
    req.cookies.get("__Secure-better-auth.session_token");
  if (direct?.value) return true;
  return req.cookies
    .getAll()
    .some((c) => c.name.includes("better-auth.session_token") && Boolean(c.value));
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();
  if (!hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/collections/:path*",
    "/board/:path*",
    "/media/:path*",
    "/calendar/:path*",
    "/seo/:path*",
    "/settings/:path*",
    "/entries/:path*",
  ],
};
