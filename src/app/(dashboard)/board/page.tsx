"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/trpc/client";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  IN_REVIEW: "На ревью",
  SCHEDULED: "Запланирована",
  PUBLISHED: "Опубликована",
  ARCHIVED: "В архиве",
};

type Card = {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
  collection: { name: string };
};

function KanbanCard({ card, stageId }: { card: Card; stageId: string }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { entryId: card.id, fromStageId: stageId },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={0}
      role="link"
      aria-label={`Открыть запись ${card.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/entries/${card.id}`);
      }}
      onDoubleClick={() => router.push(`/entries/${card.id}`)}
      className="cursor-grab rounded-xl border bg-white p-2.5 text-sm outline-none active:cursor-grabbing focus-visible:border-[#7c5cff] focus-visible:ring-2 focus-visible:ring-[#7c5cff] dark:bg-black/30"
    >
      <div className="font-semibold leading-snug">{card.title}</div>
      <div className="mt-1 text-xs opacity-60">{card.collection.name}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-[#7c5cff]/12 px-2 py-0.5 text-[11px] font-bold text-[#7c5cff]">
          {STATUS_LABELS[card.status] ?? card.status}
        </span>
        <span className="text-[11px] opacity-50">
          {new Date(card.updatedAt).toLocaleDateString("ru-RU")}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({
  stage,
  activeId,
}: {
  stage: { id: string; name: string; color: string; entries: Card[] };
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[220px] flex-col rounded-2xl border p-3 transition-colors ${
        isOver ? "border-2 border-[#7c5cff] bg-[#7c5cff]/8" : "bg-white/50 dark:bg-white/5"
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
        <span className="truncate">{stage.name}</span>
        <span className="ml-auto rounded-full border px-2 py-0.5 text-xs opacity-70">{stage.entries.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {stage.entries.map((e) =>
          e.id === activeId ? (
            <div key={e.id} className="rounded-xl border border-dashed border-[#7c5cff] p-2.5 text-xs opacity-50">
              {e.title}
            </div>
          ) : (
            <KanbanCard key={e.id} card={e} stageId={stage.id} />
          ),
        )}
        {stage.entries.length === 0 ? (
          <div className="rounded-xl border border-dashed p-3 text-center text-xs opacity-50">
            Перетащите карточку сюда
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BoardPage() {
  const utils = trpc.useUtils();
  const stagesQuery = trpc.workflow.stages.useQuery();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const move = trpc.entry.moveStage.useMutation({
    onMutate: async (input) => {
      await utils.workflow.stages.cancel();
      const prev = utils.workflow.stages.getData();
      utils.workflow.stages.setData(undefined, (old) => {
        if (!old) return old;
        let moving: Card | undefined;
        const cleared = old.map((s) => {
          const found = s.entries.find((e) => e.id === input.entryId);
          if (found) moving = { ...(found as unknown as Card), status: s.targetState ?? (found as unknown as Card).status };
          return { ...s, entries: s.entries.filter((e) => e.id !== input.entryId) };
        });
        if (!moving) return old;
        return cleared.map((s) =>
          s.id === input.stageId ? { ...s, entries: [...s.entries, moving as unknown as (typeof s.entries)[number]] } : s,
        );
      });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) utils.workflow.stages.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      setActiveId(null);
      void utils.workflow.stages.invalidate();
    },
  });

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const entryId = String(active.id);
    const targetStageId = String(over.id);
    const fromStageId = (active.data.current as { fromStageId?: string } | undefined)?.fromStageId;
    if (fromStageId === targetStageId) return;
    move.mutate({ entryId, stageId: targetStageId });
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  if (stagesQuery.isPending) {
    return <div className="p-1 text-sm opacity-70">Загрузка доски…</div>;
  }
  if (stagesQuery.isError) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-extrabold">Редполитика (Kanban)</h1>
        <div className="rounded-xl border border-red-300 p-4 text-sm text-red-500">
          Не удалось загрузить этапы: {stagesQuery.error.message}
          <button
            type="button"
            onClick={() => stagesQuery.refetch()}
            className="ml-3 rounded-lg border px-3 py-1 text-xs font-semibold text-current"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const stages = stagesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">Редполитика (Kanban)</h1>
        <span className="text-xs opacity-60">Перетаскивайте карточки между колонками</span>
        {move.isPending ? <span className="text-xs font-semibold text-[#7c5cff]">Перемещение…</span> : null}
      </div>
      {move.isError ? (
        <div className="rounded-xl border border-red-300 p-3 text-sm text-red-500">
          Не удалось переместить: {move.error.message}
        </div>
      ) : null}
      {stages.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm opacity-60">
          Этапы workflow пока не созданы
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stages.map((s) => (
              <KanbanColumn
                key={s.id}
                stage={{
                  id: s.id,
                  name: s.name,
                  color: s.color,
                  entries: s.entries as unknown as Card[],
                }}
                activeId={activeId}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
