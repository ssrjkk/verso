"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useSession } from "@/lib/auth-client";

const NAV = [
  { href: "/dashboard", label: "Дашборд" },
  { href: "/collections", label: "Коллекции" },
  { href: "/board", label: "Редполитика" },
  { href: "/media", label: "Медиатека" },
  { href: "/calendar", label: "Календарь" },
  { href: "/seo", label: "SEO" },
  { href: "/settings", label: "Настройки" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [session, isPending, router]);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-[#f97316] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Перейти к контенту
      </a>
      <aside className="no-print border-b border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-ink-900/60 md:flex md:min-h-screen md:flex-col md:gap-4 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 md:block">
          <Link href="/" className="font-display text-xl font-extrabold" aria-label="Verso — на главную">
            <span className="text-[#f97316]">Verso</span>
          </Link>
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <div className="mt-3 md:mt-0">
          <CommandPalette />
        </div>
        <nav aria-label="Основная навигация" className="mt-3 flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {NAV.map((n) => {
            const isActive = pathname === n.href || pathname?.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10",
                  isActive && "bg-[#f97316]/15 font-semibold text-[#f97316]",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 hidden md:mt-auto md:flex md:flex-col md:gap-3">
          <UserMenu />
          <ThemeToggle />
        </div>
        <div className="mt-3 md:hidden">
          <UserMenu />
        </div>
      </aside>
      <main id="content" tabIndex={-1} className="w-full max-w-6xl p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
