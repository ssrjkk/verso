"use client";

import { useEffect, useId, useState } from "react";
import { DEFAULT_BLOCKS, type BlockType } from "./block-defaults";

type Props = {
  type: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

const inputCls =
  "w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#7c5cff]";
const labelCls = "mb-1 block text-xs font-semibold opacity-70";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
  rows,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
}) {
  const fieldId = useId();
  return (
    <Field label={label} htmlFor={fieldId}>
      {multiline ? (
        <textarea
          id={fieldId}
          value={value}
          rows={rows ?? 3}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} ${mono ? "font-mono text-xs" : ""}`}
        />
      ) : (
        <input id={fieldId} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </Field>
  );
}

/** Редактирование сложной структуры через JSON-текст с кнопкой сброса. Не роняет страницу при ошибках. */
function JsonListEditor({
  label,
  hint,
  data,
  onApply,
  onReset,
}: {
  label: string;
  hint: string;
  data: unknown;
  onApply: (parsed: unknown) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(data, null, 2));
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();
  const textareaId = `${baseId}-json`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  useEffect(() => {
    setText(JSON.stringify(data, null, 2));
    setError(null);
  }, [data]);

  const apply = () => {
    try {
      const parsed = JSON.parse(text) as unknown;
      onApply(parsed);
      setError(null);
    } catch {
      setError("Некорректный JSON: проверьте скобки и запятые");
    }
  };

  const handleReset = () => {
    if (!window.confirm("Сбросить поле к значению по умолчанию?")) return;
    onReset();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className={labelCls} htmlFor={textareaId}>{label}</label>
        <button
          type="button"
          onClick={handleReset}
          aria-label={`Сбросить к дефолту: ${label}`}
          className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:border-[#7c5cff] hover:text-[#7c5cff]"
        >
          Сбросить к дефолту
        </button>
      </div>
      <div className="text-xs opacity-60" id={hintId}>{hint}</div>
      <textarea
        id={textareaId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
        className={`${inputCls} font-mono text-xs ${error ? "border-red-500" : ""}`}
      />
      {error ? <div id={errorId} role="alert" className="text-xs font-semibold text-red-500">{error}</div> : null}
      <button
        type="button"
        onClick={apply}
        className="self-start rounded-lg bg-[#7c5cff] px-4 py-1.5 text-xs font-bold text-white"
      >
        Применить JSON
      </button>
    </div>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function BlockEditor({ type, value, onChange }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  const reset = () => {
    if (type in DEFAULT_BLOCKS) onChange({ ...(DEFAULT_BLOCKS[type as BlockType] as object) });
  };

  switch (type) {
    case "HERO":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Плашка (eyebrow)" value={str(value.eyebrow)} onChange={(v) => set("eyebrow", v)} />
          <TextField label="Ссылка кнопки" value={str(value.ctaHref)} onChange={(v) => set("ctaHref", v)} />
          <div className="sm:col-span-2">
            <TextField label="Заголовок" value={str(value.title)} onChange={(v) => set("title", v)} />
          </div>
          <div className="sm:col-span-2">
            <TextField label="Подзаголовок" value={str(value.subtitle)} onChange={(v) => set("subtitle", v)} multiline rows={2} />
          </div>
          <TextField label="Текст кнопки" value={str(value.ctaLabel)} onChange={(v) => set("ctaLabel", v)} />
        </div>
      );
    case "CTA":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Заголовок" value={str(value.title)} onChange={(v) => set("title", v)} />
          </div>
          <div className="sm:col-span-2">
            <TextField label="Текст" value={str(value.text)} onChange={(v) => set("text", v)} multiline rows={2} />
          </div>
          <TextField label="Текст кнопки" value={str(value.buttonLabel)} onChange={(v) => set("buttonLabel", v)} />
          <TextField label="Ссылка кнопки" value={str(value.buttonHref)} onChange={(v) => set("buttonHref", v)} />
        </div>
      );
    case "RICH_TEXT":
      return (
        <div className="grid gap-3">
          <TextField label="Заголовок" value={str(value.title)} onChange={(v) => set("title", v)} />
          <TextField
            label="Текст (пустая строка — новый абзац)"
            value={str(value.markdown)}
            onChange={(v) => set("markdown", v)}
            multiline
            rows={6}
          />
        </div>
      );
    case "CODE":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Заголовок" value={str(value.title)} onChange={(v) => set("title", v)} />
          <TextField label="Язык" value={str(value.language)} onChange={(v) => set("language", v)} />
          <div className="sm:col-span-2">
            <TextField label="Код" value={str(value.code)} onChange={(v) => set("code", v)} multiline rows={8} mono />
          </div>
        </div>
      );
    case "FEATURES":
      return (
        <div className="grid gap-3">
          <TextField label="Заголовок секции" value={str(value.title)} onChange={(v) => set("title", v)} />
          <JsonListEditor
            label="Элементы (items)"
            hint='Массив объектов: [{"title": "…", "text": "…"}]'
            data={value.items}
            onApply={(parsed) => {
              if (Array.isArray(parsed)) set("items", parsed);
            }}
            onReset={reset}
          />
        </div>
      );
    case "PRICING":
      return (
        <div className="grid gap-3">
          <TextField label="Заголовок секции" value={str(value.title)} onChange={(v) => set("title", v)} />
          <JsonListEditor
            label="Тарифы (plans)"
            hint='Массив: [{"name","price","period","features": ["…"],"featured": false}]'
            data={value.plans}
            onApply={(parsed) => {
              if (Array.isArray(parsed)) set("plans", parsed);
            }}
            onReset={reset}
          />
        </div>
      );
    case "FAQ":
      return (
        <div className="grid gap-3">
          <TextField label="Заголовок секции" value={str(value.title)} onChange={(v) => set("title", v)} />
          <JsonListEditor
            label="Вопросы (items)"
            hint='Массив: [{"q": "Вопрос", "a": "Ответ"}]'
            data={value.items}
            onApply={(parsed) => {
              if (Array.isArray(parsed)) set("items", parsed);
            }}
            onReset={reset}
          />
        </div>
      );
    case "GALLERY":
      return (
        <div className="grid gap-3">
          <TextField label="Заголовок секции" value={str(value.title)} onChange={(v) => set("title", v)} />
          <JsonListEditor
            label="Изображения (images)"
            hint='Массив: [{"src": "https://…", "alt": "Описание"}]'
            data={value.images}
            onApply={(parsed) => {
              if (Array.isArray(parsed)) set("images", parsed);
            }}
            onReset={reset}
          />
        </div>
      );
    default:
      return (
        <JsonListEditor
          label="Свойства блока (JSON)"
          hint="Свободный JSON-объект свойств блока"
          data={value}
          onApply={(parsed) => {
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
              onChange(parsed as Record<string, unknown>);
          }}
          onReset={reset}
        />
      );
  }
}
