"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Редактор",
  VIEWER: "Наблюдатель",
};

const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-[#f97316]/15 text-[#9a3412] dark:text-[#f97316]",
  MANAGER: "bg-sky-500/15 text-sky-400",
  VIEWER: "bg-white/10 text-neutral-400",
};

export function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="rounded-xl border border-black/10 px-3 py-2.5 text-xs text-neutral-500 dark:border-white/10">
        Загрузка…
      </div>
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => router.push("/sign-in")}
        aria-label="Войти в аккаунт"
        className="w-full rounded-xl bg-[#c2410c] py-2 text-sm font-semibold text-white hover:bg-[#9a3412] focus-visible:outline-none"
      >
        Войти
      </button>
    );
  }

  const { user } = session;
  const role = (user as { role?: string }).role ?? "VIEWER";

  return (
    <div aria-label={`Пользователь ${user.email}`} className="rounded-xl border border-black/10 p-3 focus-within:border-[#f97316] dark:border-white/10">
      <p className="truncate font-display text-sm font-bold">{user.name || "Пользователь"}</p>
      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
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
        className="mt-2.5 w-full rounded-lg border border-black/10 py-1.5 text-xs font-semibold hover:bg-black/5 focus-visible:outline-none dark:border-white/10 dark:hover:bg-white/10"
      >
        Выйти
      </button>
    </div>
  );
}
