"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITIES)[number];

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toKey(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

export default function CalendarPage() {
  const utils = trpc.useUtils();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string>(dayKey(now));

  const { data: entries, isPending: entriesPending } = trpc.entry.list.useQuery({ limit: 1000 });
  const { data: tasks, isPending: tasksPending } = trpc.task.list.useQuery();
  const isLoading = entriesPending || tasksPending;
  const createTask = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setTaskTitle("");
    },
  });
  const toggleTask = trpc.task.toggle.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });
  const removeTask = trpc.task.remove.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  });

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState(dayKey(now));
  const [taskEntryId, setTaskEntryId] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("MEDIUM");

  const allEntries = entries ?? [];
  const allTasks = tasks ?? [];

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // неделя с понедельника
    const days = new Date(year, month + 1, 0).getDate();
    const count = Math.ceil((offset + days) / 7) * 7; // 35 или 42 ячейки
    return Array.from({ length: count }, (_, i) => new Date(year, month, i - offset + 1));
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, { entries: typeof allEntries; tasks: typeof allTasks }>();
    const get = (k: string) => {
      let v = map.get(k);
      if (!v) {
        v = { entries: [], tasks: [] };
        map.set(k, v);
      }
      return v;
    };
    for (const e of allEntries) {
      const k = toKey(e.scheduledFor) ?? toKey(e.publishedAt);
      if (k) get(k).entries.push(e);
    }
    for (const t of allTasks) {
      const k = toKey(t.dueDate);
      if (k) get(k).tasks.push(t);
    }
    return map;
  }, [allEntries, allTasks]);

  const monthName = new Date(year, month, 1).toLocaleString("ru-RU", { month: "long", year: "numeric" });
  const selectedItems = byDay.get(selected);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const pickDay = (d: Date) => {
    const k = dayKey(d);
    setSelected(k);
    setTaskDue(k);
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) return;
    createTask.mutate({
      title: taskTitle.trim(),
      dueDate: taskDue || undefined,
      entryId: taskEntryId || undefined,
      priority: taskPriority,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold capitalize">{monthName}</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border px-3 py-1.5 text-sm hover:border-[#f97316]">
            ←
          </button>
          <button
            onClick={() => {
              setYear(now.getFullYear());
              setMonth(now.getMonth());
              pickDay(now);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:border-[#f97316]"
          >
            Сегодня
          </button>
          <button onClick={() => shiftMonth(1)} className="rounded-lg border px-3 py-1.5 text-sm hover:border-[#f97316]">
            →
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {isLoading ? (
          <div className="rounded-2xl border p-3" aria-label="Загрузка календаря">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase opacity-60">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="skeleton min-h-[84px] animate-pulse rounded-xl bg-black/5 p-1.5 dark:bg-white/10" />
              ))}
            </div>
          </div>
        ) : (
        <div className="rounded-2xl border p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase opacity-60">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const k = dayKey(d);
              const items = byDay.get(k);
              const inMonth = d.getMonth() === month;
              const isToday = k === dayKey(now);
              const isSelected = k === selected;
              return (
                <button
                  key={i}
                  onClick={() => pickDay(d)}
                  className={`min-h-[84px] rounded-xl border p-1.5 text-left text-xs ${
                    inMonth ? "" : "opacity-40"
                  } ${isSelected ? "border-[#f97316]" : ""} ${isToday ? "bg-[#f97316]/10" : ""} hover:border-[#f97316]`}
                >
                  <div className={`font-bold ${isToday ? "text-[#f97316]" : ""}`}>{d.getDate()}</div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {(items?.entries ?? []).slice(0, 2).map((e) => (
                      <span key={e.id} className="truncate rounded bg-emerald-500/15 px-1 py-0.5" title={e.title}>
                        {e.title}
                      </span>
                    ))}
                    {(items?.tasks ?? []).slice(0, 2).map((t) => (
                      <span
                        key={t.id}
                        className={`truncate rounded px-1 py-0.5 ${t.status === "DONE" ? "bg-black/10 line-through dark:bg-white/10" : "bg-amber-500/15"}`}
                        title={t.title}
                      >
                        {t.title}
                      </span>
                    ))}
                    {((items?.entries.length ?? 0) + (items?.tasks.length ?? 0) > 4) && (
                      <span className="opacity-60">
                        +{(items?.entries.length ?? 0) + (items?.tasks.length ?? 0) - 4}
                      </span>
                    )}
                    {!((items?.entries.length ?? 0) + (items?.tasks.length ?? 0)) && (
                      <span className="opacity-40">—</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        )}
        <aside className="flex flex-col gap-3 rounded-2xl border p-4" aria-live="polite">
          <h2 className="font-bold">
            {new Date(selected + "T00:00:00").toLocaleDateString("ru-RU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase opacity-60">Записи</h3>
            {(selectedItems?.entries ?? []).map((e) => (
              <Link
                key={e.id}
                href={`/entries/${e.id}`}
                className="rounded-lg border px-2 py-1.5 text-sm hover:border-[#f97316]"
              >
                {e.title} <span className="opacity-50">· {e.status}</span>
              </Link>
            ))}
            {!selectedItems?.entries.length && <p className="text-xs opacity-60">Нет запланированного.</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase opacity-60">Задачи</h3>
            {(selectedItems?.tasks ?? []).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.status === "DONE"}
                    onChange={() => toggleTask.mutate({ id: t.id, status: t.status === "DONE" ? "TODO" : "DONE" })}
                  />
                  <span className={`truncate ${t.status === "DONE" ? "line-through opacity-60" : ""}`}>{t.title}</span>
                  <span className="ml-auto shrink-0 text-xs opacity-50">{t.priority}</span>
                </label>
                <button
                  onClick={() => { if (confirm(`Удалить задачу «${t.title}»?`)) removeTask.mutate({ id: t.id }); }}
                  aria-label={`Удалить задачу ${t.title}`}
                  title="Удалить задачу"
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-500/10"
                >
                  ✕
                </button>
              </div>
            ))}
            {!selectedItems?.tasks.length && <p className="text-xs opacity-60">Нет задач на этот день.</p>}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <h3 className="text-xs font-semibold uppercase opacity-60">Новая задача</h3>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Название задачи"
              className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]"
            />
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="rounded-lg border bg-transparent px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={taskEntryId}
                onChange={(e) => setTaskEntryId(e.target.value)}
                className="rounded-lg border bg-transparent px-2 py-2 text-sm"
              >
                <option value="">Без записи</option>
                {allEntries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as Priority)}
                className="rounded-lg border bg-transparent px-2 py-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreateTask}
              disabled={createTask.isPending || !taskTitle.trim()}
              className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {createTask.isPending ? "Создание…" : "Создать задачу"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
