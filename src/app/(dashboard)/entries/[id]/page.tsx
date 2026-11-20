"use client";

import { use, useMemo, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/trpc/client";
import BlockRender from "@/components/blocks/BlockRender";
import BlockEditor from "@/components/blocks/BlockEditor";
import OgPreview from "@/components/seo/OgPreview";
import { isValidSlug } from "@/lib/slug";
import { dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/datetime";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_LABELS,
  DEFAULT_BLOCKS,
  defaultPropsJson,
  parseProps,
  type BlockType,
} from "@/components/blocks/block-defaults";

type LocalBlock = {
  cid: string;
  id?: string;
  type: BlockType;
  order: number;
  isVisible: boolean;
  propsJson: string;
};

type BlockTypeInput = "HERO" | "FEATURES" | "PRICING" | "FAQ" | "RICH_TEXT" | "GALLERY" | "CODE" | "CTA";

let cidCounter = 0;
function nextCid(): string {
  cidCounter += 1;
  return `local-${Date.now()}-${cidCounter}`;
}

function safeObject(propsJson: string, type: BlockType): Record<string, unknown> {
  return parseProps<Record<string, unknown>>(propsJson, { ...(DEFAULT_BLOCKS[type] as object) } as Record<string, unknown>);
}

function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {off ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M7 8V4h10v4" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </svg>
  );
}

// Стабильный внешний источник времени. `getSnapshot` обязан возвращать одно
// и то же значение между уведомлениями: `Date.now()` на каждый вызов даёт
// бесконечный цикл рендеров (React error #185), особенно после раскрытия
// редактора блока.
let nowSnapshot = 0;
let nowTimer: number | undefined;
const nowSubscribers = new Set<() => void>();

function subscribeNow(onStoreChange: () => void) {
  nowSubscribers.add(onStoreChange);
  if (nowTimer === undefined) {
    nowSnapshot = Date.now();
    nowTimer = window.setInterval(() => {
      nowSnapshot = Date.now();
      for (const notify of nowSubscribers) notify();
    }, 60_000);
  }
  // После гидратации сразу отдаём актуальное время, не ждём минуту.
  onStoreChange();
  return () => {
    nowSubscribers.delete(onStoreChange);
    if (nowSubscribers.size === 0 && nowTimer !== undefined) {
      window.clearInterval(nowTimer);
      nowTimer = undefined;
    }
  };
}

function getNowSnapshot() {
  return nowSnapshot;
}

function getServerNowSnapshot() {
  return 0;
}

function SortableBlockRow({
  block,
  index,
  expanded,
  onToggleExpand,
  onToggleVisible,
  onRemove,
  onPropsChange,
}: {
  block: LocalBlock;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  onPropsChange: (next: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.cid });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  // Парсим propsJson один раз на изменение: новый объект на каждом рендере
  // ломает синхронизацию JSON-редакторов и провоцирует лишние обновления.
  const props = useMemo(
    () => safeObject(block.propsJson, block.type),
    [block.propsJson, block.type],
  );

  return (
    <div ref={setNodeRef} style={style} className="rounded-sm border bg-white/60 dark:bg-white/5">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Перетащить"
          aria-label="Перетащить блок"
          className="cursor-grab rounded-sm border px-2 py-1 text-xs opacity-70 hover:opacity-100 active:cursor-grabbing"
        >
          ⋮⋮
        </button>
        <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-bold text-accent-ink dark:text-accent-soft">
          {BLOCK_TYPE_LABELS[block.type]} · #{index + 1}
        </span>
        {!block.isVisible ? (
          <span className="rounded-full border px-2 py-0.5 text-xs opacity-60">скрыт</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleVisible}
            title={block.isVisible ? "Скрыть блок" : "Показать блок"}
            aria-label={block.isVisible ? "Скрыть блок" : "Показать блок"}
            className="rounded-sm border px-2 py-1 text-xs hover:border-accent"
          >
            <EyeIcon off={!block.isVisible} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded-sm border px-2.5 py-1 text-xs font-semibold hover:border-accent"
          >
            {expanded ? "Свернуть" : "Редактировать"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Удалить блок"
            aria-label="Удалить блок"
            className="rounded-sm border px-2 py-1 text-xs text-red-700 dark:text-red-400 hover:border-red-500"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t p-3">
          <BlockEditor type={block.type} value={props} onChange={onPropsChange} />
        </div>
      ) : null}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  IN_REVIEW: "На ревью",
  SCHEDULED: "Запланирована",
  PUBLISHED: "Опубликована",
  ARCHIVED: "В архиве",
};

export default function EntryBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const entryQuery = trpc.entry.get.useQuery({ id });
  const blocksQuery = trpc.block.list.useQuery({ entryId: id });

  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saveNote, setSaveNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // SEO-форма
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [noIndex, setNoIndex] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [seoHydrated, setSeoHydrated] = useState(false);

  const slugValid = slug.trim() === "" || isValidSlug(slug.trim());

  // Время — внешнее изменяемое состояние: обновляем раз в минуту и не
  // трогаем Date.now() во время рендера (SSR-снапшот = 0 до гидратации).
  const nowMs = useSyncExternalStore(
    subscribeNow,
    getNowSnapshot,
    getServerNowSnapshot,
  );

  function relativeTime(iso: string | Date): string {
    const d = new Date(iso).getTime();
    if (Number.isNaN(d) || nowMs === 0) return "";
    const diffSec = Math.round((d - nowMs) / 1000);
    const abs = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
    if (abs < 60) return rtf.format(diffSec, "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
    if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
    return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Однократная гидратация локального состояния из асинхронных данных.
  // Это рекомендованный React-паттерн «adjust state during render»,
  // а не эффект: эффект дал бы лишний кадр с пустым редактором.
  if (!hydrated && blocksQuery.data) {
    setBlocks(
      blocksQuery.data.map((b) => ({
        cid: b.id,
        id: b.id,
        type: (BLOCK_TYPES as readonly string[]).includes(b.type) ? (b.type as BlockType) : "RICH_TEXT",
        order: b.order,
        isVisible: b.isVisible,
        propsJson: b.propsJson,
      })),
    );
    setHydrated(true);
  }

  if (!seoHydrated && entryQuery.data) {
    const e = entryQuery.data;
    setTitle(e.title ?? "");
    setSlug(e.slug ?? "");
    setExcerpt(e.excerpt ?? "");
    setSeoTitle(e.seoTitle ?? "");
    setSeoDescription(e.seoDescription ?? "");
    setOgImage(e.ogImageUrl ?? "");
    setCanonicalUrl(e.canonicalUrl ?? "");
    setNoIndex(Boolean(e.noIndex));
    // Храним локальное значение: datetime-local должен показывать время
    // пользователя, а не UTC-срез (иначе расписание «уезжает» на offset).
    setScheduledFor(toDateTimeLocalValue(e.scheduledFor));
    setStatus(e.status ?? "DRAFT");
    setSeoHydrated(true);
  }

  const saveBlocks = trpc.block.upsertMany.useMutation({
    onSuccess: async () => {
      setFeedback("Блоки сохранены");
      await utils.block.list.invalidate({ entryId: id });
      await utils.entry.get.invalidate({ id });
    },
    onError: (err) => setFeedback(`Ошибка сохранения: ${err.message}`),
  });
  const updateEntry = trpc.entry.update.useMutation({
    onSuccess: async () => {
      setFeedback("Запись обновлена");
      await utils.entry.get.invalidate({ id });
    },
    onError: (err) => setFeedback(`Ошибка обновления: ${err.message}`),
  });
  const publishEntry = trpc.entry.publish.useMutation({
    onSuccess: async () => {
      setFeedback("Запись опубликована");
      await utils.entry.get.invalidate({ id });
    },
    onError: (err) => setFeedback(`Ошибка публикации: ${err.message}`),
  });
  const restoreRevision = trpc.entry.restoreRevision.useMutation({
    onSuccess: async () => {
      setFeedback("Откат выполнен");
      setHydrated(false);
      setSeoHydrated(false);
      await utils.entry.get.invalidate({ id });
      await utils.block.list.invalidate({ entryId: id });
    },
    onError: (err) => setFeedback(`Ошибка отката: ${err.message}`),
  });

  const sortableIds = useMemo(() => blocks.map((b) => b.cid), [blocks]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.cid === active.id);
      const newIndex = prev.findIndex((b) => b.cid === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((b, i) => ({ ...b, order: i }));
    });
  }

  function addBlock(type: BlockType) {
    setBlocks((prev) => [
      ...prev,
      { cid: nextCid(), type, order: prev.length, isVisible: true, propsJson: defaultPropsJson(type) },
    ]);
  }

  function handleSave() {
    setFeedback(null);
    saveBlocks.mutate({
      entryId: id,
      blocks: blocks.map((b, i) => ({
        id: b.id,
        type: b.type as BlockTypeInput,
        order: i,
        isVisible: b.isVisible,
        propsJson: b.propsJson,
      })),
    });
  }

  function handleSeoSave() {
    setFeedback(null);
    updateEntry.mutate({
      id,
      title: title || undefined,
      slug: slug || undefined,
      excerpt: excerpt || undefined,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      // Пустая строка → null: поле можно снять, а не только заменить.
      ogImageUrl: ogImage.trim() || null,
      canonicalUrl: canonicalUrl.trim() || null,
      noIndex,
      // Пустая строка → null: расписание можно снять, а не только заменить.
      scheduledFor: dateTimeLocalToIso(scheduledFor),
      status: status as "DRAFT" | "IN_REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED",
      changeNote: saveNote || "Обновление SEO и метаданных",
      // Оптимистичная блокировка: сервер отклонит сохранение чужой версии кодом CONFLICT.
      expectedUpdatedAt: entry?.updatedAt
        ? entry.updatedAt instanceof Date
          ? entry.updatedAt.toISOString()
          : String(entry.updatedAt)
        : undefined,
    });
  }

  if (entryQuery.isPending || blocksQuery.isPending) {
    return <div className="p-6 text-sm opacity-70">Загрузка конструктора…</div>;
  }
  if (entryQuery.isError) {
    return <div className="p-6 text-sm text-red-700 dark:text-red-400">Не удалось загрузить запись: {entryQuery.error.message}</div>;
  }
  if (blocksQuery.isError) {
    return <div className="p-6 text-sm text-red-700 dark:text-red-400">Не удалось загрузить блоки: {blocksQuery.error.message}</div>;
  }
  const entry = entryQuery.data;
  if (!entry) return <div className="p-6 text-sm opacity-70">Запись не найдена</div>;

  const revisions = entry.revisions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">Конструктор: {entry.title}</h1>
        <span className="rounded-full bg-accent/12 px-3 py-1 text-xs font-bold text-accent-ink dark:text-accent-soft">
          {STATUS_LABELS[entry.status] ?? entry.status}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold hover:border-accent"
          >
            <PrinterIcon />
            Печать
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveBlocks.isPending}
            className="rounded-sm bg-accent-strong px-5 py-2 text-sm font-bold text-white hover:bg-accent-deep disabled:opacity-50"
          >
            {saveBlocks.isPending ? "Сохранение…" : "Сохранить блоки"}
          </button>
        </div>
      </div>

      {feedback ? (
        <div className="no-print rounded-sm border border-accent/40 bg-accent/8 px-4 py-2 text-sm">{feedback}</div>
      ) : null}

      {/* Добавить блоки */}
      <section className="no-print rounded-sm border p-4">
        <div className="mb-2 text-sm font-bold">Добавить блок</div>
        <div className="flex flex-wrap gap-2">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addBlock(t)}
              className="rounded-sm border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
            >
              + {BLOCK_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {/* Список блоков с dnd-kit */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="no-print flex flex-col gap-2">
            {blocks.length === 0 ? (
              <div className="rounded-sm border border-dashed p-6 text-center text-sm opacity-60">
                Блоков пока нет — добавьте первый блок выше
              </div>
            ) : null}
            {blocks.map((b, i) => (
              <SortableBlockRow
                key={b.cid}
                block={b}
                index={i}
                expanded={!!expanded[b.cid]}
                onToggleExpand={() => setExpanded((prev) => ({ ...prev, [b.cid]: !prev[b.cid] }))}
                onToggleVisible={() =>
                  setBlocks((prev) => prev.map((x) => (x.cid === b.cid ? { ...x, isVisible: !x.isVisible } : x)))
                }
                onRemove={() => setBlocks((prev) => prev.filter((x) => x.cid !== b.cid).map((x, idx) => ({ ...x, order: idx })))}
                onPropsChange={(next) =>
                  setBlocks((prev) =>
                    prev.map((x) => (x.cid === b.cid ? { ...x, propsJson: JSON.stringify(next, null, 2) } : x)),
                  )
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Превью */}
      <section className="print-clean rounded-sm border p-5">
        <h2 className="font-display mb-3 text-xl font-bold">Превью</h2>
        <div className="flex flex-col gap-4">
          {blocks.filter((b) => b.isVisible).length === 0 ? (
            <div className="text-sm opacity-60">Нет видимых блоков для превью</div>
          ) : null}
          {blocks
            .filter((b) => b.isVisible)
            .map((b) => (
              <BlockRender key={b.cid} type={b.type} propsJson={b.propsJson} />
            ))}
        </div>
      </section>

      {/* SEO-панель */}
      <section className="no-print rounded-sm border p-4">
        <h2 className="font-display mb-3 text-lg font-bold">SEO и публикация</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block" htmlFor="seo-title">
            <span className="mb-1 block text-xs font-semibold opacity-70">Заголовок</span>
            <input id="seo-title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
          </label>
          <div className="block">
            <label htmlFor="seo-slug" className="mb-1 block text-xs font-semibold opacity-70">Slug</label>
            <input
              id="seo-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-invalid={!slugValid}
              aria-describedby="seo-slug-hint"
              className={`w-full rounded-sm border bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus:border-accent ${!slugValid ? "border-red-500" : ""}`}
            />
            <p id="seo-slug-hint" className="mt-1 text-xs opacity-60">
              Только латиница, цифры и дефисы (a-z, 0-9, -).
              {!slugValid && <span role="alert" className="font-semibold text-red-700 dark:text-red-400"> Некорректный slug.</span>}
            </p>
          </div>
          <label className="block sm:col-span-2" htmlFor="seo-excerpt">
            <span className="mb-1 block text-xs font-semibold opacity-70">Анонс (excerpt)</span>
            <textarea id="seo-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
          </label>
          <div className="block">
            <label htmlFor="seo-meta-title" className="mb-1 block text-xs font-semibold opacity-70">SEO-заголовок</label>
            <input id="seo-meta-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={120} className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
            <p className="mt-1 text-xs opacity-60" aria-live="polite">{seoTitle.length}/60 — оптимально до 60 символов</p>
          </div>
          <div className="block">
            <label htmlFor="seo-meta-desc" className="mb-1 block text-xs font-semibold opacity-70">SEO-описание</label>
            <input id="seo-meta-desc" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={320} className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
            <p className="mt-1 text-xs opacity-60" aria-live="polite">{seoDescription.length}/160 — оптимально до 160 символов</p>
          </div>
          <div className="block sm:col-span-2">
            <label htmlFor="seo-og-image" className="mb-1 block text-xs font-semibold opacity-70">OG-изображение (URL)</label>
            <input
              id="seo-og-image"
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder="https://…/og.png"
              className="w-full rounded-sm border bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
            />
            <p className="mt-1 text-xs opacity-60">Абсолютный http(s)-URL. Сохраняется в og:image и показан в превью ниже.</p>
          </div>
          <div className="block sm:col-span-2">
            <label htmlFor="seo-canonical" className="mb-1 block text-xs font-semibold opacity-70">Канонический URL</label>
            <input
              id="seo-canonical"
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              placeholder="https://site.ru/article или /article"
              className="w-full rounded-sm border bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
            />
            <p className="mt-1 text-xs opacity-60">Абсолютный адрес или путь от корня. Попадает в link rel=&quot;canonical&quot;.</p>
          </div>
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={noIndex}
              onChange={(e) => setNoIndex(e.target.checked)}
            />
            Закрыть от индексации (noindex)
          </label>
          <label className="block" htmlFor="seo-scheduled">
            <span className="mb-1 block text-xs font-semibold opacity-70">Запланировать на</span>
            <input id="seo-scheduled" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block" htmlFor="seo-status">
            <span className="mb-1 block text-xs font-semibold opacity-70">Статус</span>
            <select id="seo-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent">
              {Object.entries(STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2" htmlFor="seo-note">
            <span className="mb-1 block text-xs font-semibold opacity-70">Комментарий к изменению</span>
            <input id="seo-note" value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Например: обновил hero и тарифы" className="w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent" />
          </label>
        </div>
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold">Предпросмотр в соцсетях</h3>
          <OgPreview
            title={seoTitle || title}
            description={seoDescription || excerpt}
            image={ogImage || undefined}
            url={`/p/${entry.collection?.slug ?? "entry"}/${slug || entry.slug}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSeoSave}
            disabled={updateEntry.isPending || !slugValid}
            aria-busy={updateEntry.isPending}
            className="rounded-sm border border-accent px-5 py-2 text-sm font-bold text-accent-ink hover:bg-accent/10 disabled:opacity-50 dark:text-accent-soft"
          >
            {updateEntry.isPending ? "Сохранение…" : "Сохранить SEO"}
          </button>
          <button
            type="button"
            onClick={() => publishEntry.mutate({ id })}
            disabled={publishEntry.isPending}
            aria-busy={publishEntry.isPending}
            className="rounded-sm bg-accent-strong px-5 py-2 text-sm font-bold text-white hover:bg-accent-deep disabled:opacity-50"
          >
            {publishEntry.isPending ? "Публикация…" : "Опубликовать"}
          </button>
        </div>
      </section>

      {/* Ревизии */}
      <section className="no-print rounded-sm border p-4">
        <h2 className="font-display mb-3 text-lg font-bold">История ревизий ({revisions.length})</h2>
        {revisions.length === 0 ? (
          <div className="text-sm opacity-60">Ревизий пока нет</div>
        ) : (
          <div className="flex flex-col gap-2">
            {revisions.map((r, idx) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2 text-sm">
                <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-bold text-accent-ink dark:text-accent-soft">v{r.version}</span>
                <span className="opacity-80">{r.changeNote ?? "Без комментария"}</span>
                <span className="text-xs opacity-60" title={new Date(r.createdAt).toLocaleString("ru-RU")}>
                  {new Date(r.createdAt).toLocaleString("ru-RU")} · {relativeTime(r.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => restoreRevision.mutate({ entryId: id, revisionId: r.id })}
                  disabled={restoreRevision.isPending || idx === 0}
                  title={idx === 0 ? "Текущая версия" : `Откатить к v${r.version}`}
                  aria-label={idx === 0 ? `Текущая версия v${r.version}` : `Откатить к версии ${r.version}`}
                  className="ml-auto rounded-sm border px-3 py-1 text-xs font-semibold hover:border-accent disabled:opacity-50"
                >
                  {idx === 0 ? "Текущая" : "Откатить"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
