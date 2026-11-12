/**
 * Безопасная внутренняя цель редиректа.
 *
 * Один и тот же барьер для proxy (SEO-редиректы) и формы входа (`?next=`):
 * только относительный путь от одного `/`, без protocol-relative `//`,
 * обратных слэшей и служебных префиксов `/api`, `/_next`.
 */
const FORBIDDEN_PREFIXES = ["/api", "/_next"] as const;

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  const pathname = value.split(/[?#]/, 1)[0];
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return fallback;
  }
  return value;
}
