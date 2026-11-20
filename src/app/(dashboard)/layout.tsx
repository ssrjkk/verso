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
  { href: "/dashboard", label: "Дашборд", index: "01" },
  { href: "/collections", label: "Коллекции", index: "02" },
  { href: "/board", label: "Редполитика", index: "03" },
  { href: "/media", label: "Медиатека", index: "04" },
  { href: "/calendar", label: "Календарь", index: "05" },
  { href: "/seo", label: "SEO", index: "06" },
  { href: "/settings", label: "Настройки", index: "07" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [session, isPending, router]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-sm focus:bg-accent-strong focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Перейти к контенту
      </a>
      <aside className="no-print border-b border-ink-950/10 bg-paper-raised/80 p-4 dark:border-white/10 dark:bg-ink-900/50 md:flex md:min-h-screen md:flex-col md:gap-5 md:border-b-0 md:border-r md:p-5">
        <div className="flex items-center justify-between gap-3 md:block">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5"
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-[2px] bg-accent-strong font-mono text-xs font-semibold text-white"
            >
              V
            </span>
            <span className="font-display text-xl font-bold tracking-[-0.02em]">Verso</span>
          </Link>
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-3 md:mt-0">
          <CommandPalette />
        </div>

        <nav aria-label="Основная навигация" className="mt-3 md:mt-1">
          <p className="mb-2 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400 md:block">
            Рабочее пространство
          </p>
          <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {NAV.map((n) => {
              const isActive = pathname === n.href || pathname?.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2 py-2 text-sm text-stone-600 transition-colors hover:border-accent/40 hover:text-ink-950 dark:text-stone-300 dark:hover:text-white md:border-b-0 md:border-l-2 md:px-3",
                    isActive &&
                      "border-accent bg-accent/8 font-semibold text-accent-ink dark:border-accent-soft dark:bg-accent-soft/10 dark:text-accent-soft",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="hidden font-mono text-[10px] tracking-wider opacity-60 md:inline"
                  >
                    {n.index}
                  </span>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-3 hidden md:mt-auto md:flex md:flex-col md:gap-3">
          <UserMenu />
          <ThemeToggle />
        </div>
        <div className="mt-3 md:hidden">
          <UserMenu />
        </div>
      </aside>
      <main id="content" tabIndex={-1} className="w-full min-w-0 max-w-6xl p-4 sm:p-6 lg:p-10">
        {children}
      </main>
    </div>
  );
}
