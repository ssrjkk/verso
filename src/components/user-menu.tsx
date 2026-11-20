"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Редактор",
  VIEWER: "Наблюдатель",
};

const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-accent/10 text-accent-ink dark:bg-accent-soft/15 dark:text-accent-soft",
  MANAGER: "bg-sky-500/10 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  VIEWER: "bg-ink-950/10 text-stone-700 dark:bg-white/10 dark:text-stone-300",
};

export function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="rounded-sm border border-ink-950/10 px-3 py-2.5 text-xs text-stone-600 dark:border-white/10 dark:text-stone-400">
        Загрузка…
      </div>
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => router.push("/sign-in")}
        aria-label="Войти в аккаунт"
        className="w-full rounded-sm bg-accent-strong py-2 text-sm font-semibold text-white hover:bg-accent-deep focus-visible:outline-none"
      >
        Войти
      </button>
    );
  }

  const { user } = session;
  const role = (user as { role?: string }).role ?? "VIEWER";

  return (
    <div aria-label={`Пользователь ${user.email}`} className="rounded-sm border border-ink-950/10 p-3 focus-within:border-accent dark:border-white/10">
      <p className="truncate font-display text-sm font-bold">{user.name || "Пользователь"}</p>
      <p className="truncate text-xs text-stone-600 dark:text-stone-400">{user.email}</p>
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_STYLE[role] ?? ROLE_STYLE.VIEWER}`}
      >
        {ROLE_LABEL[role] ?? role}
      </span>
      <button
        onClick={async () => {
          await signOut();
          router.push("/sign-in");
          router.refresh();
        }}
        aria-label="Выйти из аккаунта"
        className="mt-2.5 w-full rounded-sm border border-ink-950/10 py-1.5 text-xs font-semibold hover:bg-ink-950/5 focus-visible:outline-none dark:border-white/10 dark:hover:bg-white/10"
      >
        Выйти
      </button>
    </div>
  );
}
