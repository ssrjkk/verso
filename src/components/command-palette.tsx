"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";

type PaletteItem = {
  kind: "Запись" | "Коллекция" | "Медиа";
  label: string;
  sub: string;
  href: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K — открыть/закрыть, Esc — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open ]);

  // Три параллельных запроса, результаты объединяются
  const needle = q.trim();
  const entriesQuery = trpc.entry.list.useQuery({ search: needle || undefined }, { enabled: open });
  const collectionsQuery = trpc.collection.list.useQuery(undefined, { enabled: open });
  const mediaQuery = trpc.media.list.useQuery({ search: needle || undefined }, { enabled: open });

  const items: PaletteItem[] = useMemo(() => {
    const n = needle.toLowerCase();
    const cols = (collectionsQuery.data ?? [])
      .filter((c) => !n || c.name.toLowerCase().includes(n) || c.slug.includes(n))
      .slice(0, 5)
      .map<PaletteItem>((c) => ({ kind: "Коллекция", label: c.name, sub: `/${c.slug}`, href: `/collections/${c.slug}` }));
    const ents = (entriesQuery.data ?? [])
      .slice(0, 8)
      .map<PaletteItem>((e) => ({ kind: "Запись", label: e.title, sub: e.status, href: `/entries/${e.id}` }));
    const med = (mediaQuery.data ?? [])
      .slice(0, 5)
      .map<PaletteItem>((m) => ({ kind: "Медиа", label: m.filename, sub: m.folder, href: "/media" }));
    return [...cols, ...ents, ...med];
  }, [needle, collectionsQuery.data, entriesQuery.data, mediaQuery.data]);

  useEffect(() => {
    setActive(0);
  }, [needle]);

  const clamped = items.length === 0 ? 0 : Math.min(active, items.length - 1);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const item = items[clamped];
      if (item) go(item.href);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Открыть глобальный поиск (Ctrl+K): ⌘K — поиск…"
        aria-haspopup="dialog"
        aria-expanded={false}
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-left text-sm opacity-60 hover:opacity-100 focus-visible:opacity-100"
      >
        ⌘K — поиск…
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Глобальный поиск по контенту"
        className="mt-20 w-full max-w-lg overflow-hidden rounded-2xl border bg-white shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <label htmlFor="command-palette-input" className="sr-only">
          Поиск записей, коллекций, медиа
        </label>
        <input
          id="command-palette-input"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Поиск записей, коллекций, медиа…"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="command-palette-listbox"
          aria-activedescendant={items.length > 0 ? `palette-option-${clamped}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-80 overflow-y-auto p-2">
          <div id="command-palette-listbox" role="listbox" aria-label="Результаты поиска">
          {items.map((item, i) => (
            <button
              key={`${item.kind}-${item.href}-${i}`}
              id={`palette-option-${i}`}
              role="option"
              aria-selected={i === clamped}
              onClick={() => go(item.href)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                i === clamped ? "bg-[#f97316]/15" : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <span className="rounded bg-black/10 px-1.5 py-0.5 text-[11px] uppercase opacity-70 dark:bg-white/10">
                {item.kind}
              </span>
              <span className="truncate">{item.label}</span>
              <span className="ml-auto shrink-0 text-xs opacity-50">{item.sub}</span>
            </button>
          ))}
          </div>
          {items.length === 0 && <p className="p-4 text-sm opacity-60">Ничего не найдено</p>}
        </div>
      </div>
    </div>
  );
}
