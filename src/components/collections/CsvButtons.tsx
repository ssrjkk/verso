"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { trpc } from "@/trpc/client";

type EntryStatus = "DRAFT" | "IN_REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

const btnCls =
  "rounded-lg border px-3 py-1.5 text-xs hover:border-[#f97316] disabled:opacity-50 whitespace-nowrap";

export function ExportButton({
  collectionId,
  status,
  search,
  label,
}: {
  collectionId: string;
  status?: EntryStatus;
  search?: string;
  label?: string;
}) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const csv = await utils.collection.exportCsv.fetch({
        collectionId,
        ...(status ? { status } : {}),
        ...(search && search.trim() !== "" ? { search: search.trim() } : {}),
      });
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collection-${collectionId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <button onClick={handleExport} disabled={busy} aria-busy={busy} className={btnCls}>
        {busy ? "Экспорт…" : (label ?? "Экспорт CSV")}
      </button>
      {error && (
        <span role="alert" aria-live="polite" className="text-xs text-red-500">
          {error}
        </span>
      )}
    </span>
  );
}

export function ImportButton({
  collectionId,
  onDone,
}: {
  collectionId: string;
  onDone?: (r: { imported: number; skipped: number }) => void;
}) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string | null>(null);
  const importCsv = trpc.collection.importCsv.useMutation({
    onSuccess: (res) => {
      setState(`Импортировано: ${res.imported}, пропущено: ${res.skipped}`);
      utils.collection.list.invalidate();
      utils.collection.get.invalidate();
      utils.entry.list.invalidate();
      onDone?.(res);
    },
    onError: (e) => setState(`Ошибка: ${e.message}`),
  });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setState("Загрузка…");
    importCsv.mutate({ collectionId, csv: text });
    e.target.value = "";
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importCsv.isPending}
        aria-busy={importCsv.isPending}
        className={btnCls}
      >
        {importCsv.isPending ? "Импорт…" : "Импорт CSV"}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
      {state && (
        <span role="status" aria-live="polite" className="text-xs opacity-70">
          {state}
        </span>
      )}
    </span>
  );
}
