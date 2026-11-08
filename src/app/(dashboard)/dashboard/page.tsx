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
  const todayTasks = (tasks ?? []).filter((t) => (t.dueDate ? new Date(t.dueDate).toDateString() === todayStr : false));

  const recent = useMemo(() => (entries ?? []).slice(0, 5), [entries]);
  const hasMonthly = monthly.some((m) => m.count > 0);

  return (
    <div className="flex flex-col gap-6" aria-busy={isLoading}>
      <h1 className="font-display text-3xl font-extrabold">Дашборд</h1>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3" aria-label="Загрузка статистики">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton animate-pulse rounded-2xl border p-5">
              <div className="h-8 w-16 rounded-lg bg-black/10 dark:bg-white/10" />
              <div className="mt-2 h-4 w-24 rounded bg-black/10 dark:bg-white/10" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Коллекций", value: collections?.length ?? 0 },
            { label: "Опубликовано", value: published },
            { label: "Задач редакции", value: tasks?.length ?? 0 },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border bg-white p-5 dark:bg-white/5">
              <div className="text-3xl font-extrabold text-[#f97316]">{c.value}</div>
              <div className="text-sm opacity-70">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 dark:bg-white/5">
          <h2 className="mb-2 font-bold">Публикации · последние 6 мес</h2>
          {isLoading ? (
            <div className="skeleton h-[220px] animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
          ) : hasMonthly ? (
            <MonthlyBars data={monthly} />
          ) : (
            <p className="flex h-[220px] items-center justify-center rounded-xl border border-dashed text-sm opacity-60">
              Нет публикаций за 6 мес
            </p>
          )}
        </div>
        <div className="rounded-2xl border bg-white p-5 dark:bg-white/5">
          <h2 className="mb-2 font-bold">Статусы записей</h2>
          {isLoading ? (
            <div className="skeleton h-[220px] animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
          ) : statusPie.length ? (
            <StatusPie data={statusPie} />
          ) : (
            <p className="flex h-[220px] items-center justify-center rounded-xl border border-dashed text-sm opacity-60">
              Записей нет.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 dark:bg-white/5">
          <h2 className="mb-2 font-bold">Задачи на сегодня</h2>
          {isLoading ? (
            <div className="skeleton h-16 animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
          ) : !todayTasks.length ? (
            <p className="text-sm opacity-60">Задач на сегодня нет</p>
          ) : (
            todayTasks.map((t) => (
              <div key={t.id} className="flex justify-between border-b py-2 text-sm last:border-0">
                <span>{t.title}</span><span className="opacity-60">{t.status}</span>
              </div>
            ))
          )}
        </div>
        <div className="rounded-2xl border bg-white p-5 dark:bg-white/5">
          <h2 className="mb-2 font-bold">Последние записи</h2>
          {isLoading ? (
            <div className="skeleton h-16 animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
          ) : !recent.length ? (
            <p className="text-sm opacity-60">Записей нет.</p>
          ) : (
            recent.map((e) => (
              <Link
                key={e.id}
                href={`/entries/${e.id}`}
                className="flex justify-between gap-2 rounded-lg border-b py-2 text-sm outline-none last:border-0 hover:text-[#f97316] focus-visible:ring-2 focus-visible:ring-[#f97316]"
              >
                <span className="truncate underline-offset-2 hover:underline">{e.title}</span>
                <span className="shrink-0 opacity-60">{e.status}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
