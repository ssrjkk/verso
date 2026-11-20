"use client";
import { trpc } from "@/trpc/client";
import { useMemo } from "react";
import Link from "next/link";
import { MonthlyBars, StatusPie } from "@/components/dashboard/Charts";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { data: collections, isPending: collectionsPending } = trpc.collection.list.useQuery();
  const { data: stages, isPending: stagesPending } = trpc.workflow.stages.useQuery();
  const { data: tasks, isPending: tasksPending } = trpc.task.list.useQuery();
  const { data: entries, isPending: entriesPending } = trpc.entry.list.useQuery({});

  const isLoading = collectionsPending || stagesPending || tasksPending || entriesPending;

  const allEntries = useMemo(() => stages?.flatMap((s) => s.entries) ?? [], [stages]);

  const monthly = useMemo(() => {
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(monthKey(d), 0);
    }
    for (const e of allEntries) {
      const pub = (e as { publishedAt?: string | Date | null }).publishedAt;
      if (!pub) continue;
      const k = monthKey(new Date(pub));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([month, count]) => ({ month, count }));
  }, [allEntries]);

  const statusPie = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of allEntries) counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [allEntries]);

  const published = allEntries.filter((e) => e.status === "PUBLISHED").length;
  const todayStr = new Date().toDateString();
  const todayTasks = (tasks ?? []).filter((t) =>
    t.dueDate ? new Date(t.dueDate).toDateString() === todayStr : false,
  );

  const recent = useMemo(() => (entries ?? []).slice(0, 5), [entries]);
  const hasMonthly = monthly.some((m) => m.count > 0);

  return (
    <div className="flex flex-col gap-8" aria-busy={isLoading}>
      <header className="flex flex-col gap-5 border-b border-ink-950/10 pb-6 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-600 dark:text-stone-400">
            Сводка редакции
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
            Дашборд
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/collections"
            className="inline-flex items-center gap-2 rounded-sm bg-accent-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
          >
            Создать коллекцию <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/media"
            className="inline-flex items-center rounded-sm border border-ink-950/20 px-4 py-2 text-sm font-semibold transition-colors hover:border-accent hover:text-accent-ink dark:border-white/20 dark:hover:border-accent-soft dark:hover:text-accent-soft"
          >
            Медиатека
          </Link>
        </div>
      </header>

      {isLoading ? (
        <div
          className="grid gap-4 border-y border-ink-950/10 py-5 dark:border-white/10 sm:grid-cols-3"
          aria-label="Загрузка статистики"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-sm" />
          ))}
        </div>
      ) : (
        <dl className="grid border-y border-ink-950/10 dark:border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-ink-950/10 dark:sm:divide-white/10">
          {[
            {
              label: "Коллекций",
              value: collections?.length ?? 0,
              note: "структур контента",
            },
            {
              label: "Опубликовано",
              value: published,
              note: "записей в публичном доступе",
            },
            {
              label: "Задач редакции",
              value: tasks?.length ?? 0,
              note: `на сегодня: ${todayTasks.length}`,
            },
          ].map((c) => (
            <div key={c.label} className="flex flex-col gap-1 px-0 py-5 sm:px-5 sm:first:pl-0">
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
                {c.label}
              </dt>
              <dd className="font-display text-4xl font-bold leading-none text-accent-ink dark:text-accent-soft">
                {c.value}
              </dd>
              <p className="text-xs text-stone-600 dark:text-stone-400">{c.note}</p>
            </div>
          ))}
        </dl>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-ink-950/10 bg-paper-raised/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
            Публикации · последние 6 месяцев
          </h2>
          {isLoading ? (
            <div className="skeleton mt-3 h-[220px] rounded-sm" />
          ) : hasMonthly ? (
            <div className="mt-3">
              <MonthlyBars data={monthly} />
            </div>
          ) : (
            <p className="mt-3 flex h-[220px] items-center justify-center rounded-sm border border-dashed border-ink-950/15 text-sm text-stone-600 dark:border-white/15 dark:text-stone-400">
              Пока нет опубликованных записей за полгода.
            </p>
          )}
        </section>

        <section className="rounded-sm border border-ink-950/10 bg-paper-raised/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
            Статусы записей
          </h2>
          {isLoading ? (
            <div className="skeleton mt-3 h-[220px] rounded-sm" />
          ) : statusPie.length ? (
            <div className="mt-3">
              <StatusPie data={statusPie} />
            </div>
          ) : (
            <p className="mt-3 flex h-[220px] items-center justify-center rounded-sm border border-dashed border-ink-950/15 text-sm text-stone-600 dark:border-white/15 dark:text-stone-400">
              Записей ещё нет.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-ink-950/10 bg-paper-raised/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
            Задачи на сегодня
          </h2>
          {isLoading ? (
            <div className="skeleton mt-3 h-16 rounded-sm" />
          ) : !todayTasks.length ? (
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
              На сегодня задач нет.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-950/10 dark:divide-white/10">
              {todayTasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span>{t.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-ink-950/10 bg-paper-raised/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400">
            Последние записи
          </h2>
          {isLoading ? (
            <div className="skeleton mt-3 h-16 rounded-sm" />
          ) : !recent.length ? (
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
              Записей ещё нет. Создайте коллекцию и добавьте первый материал.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-950/10 dark:divide-white/10">
              {recent.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/entries/${e.id}`}
                    className="flex justify-between gap-3 rounded-sm py-2.5 text-sm outline-none hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-accent dark:hover:text-accent-soft"
                  >
                    <span className="truncate underline-offset-2 hover:underline">{e.title}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-stone-600 dark:text-stone-400">
                      {e.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
