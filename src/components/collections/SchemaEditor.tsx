"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLLECTION_FIELD_TYPES,
  FIELD_TYPE_LABELS,
  checkCollectionSchema,
  type CollectionField,
  type CollectionFieldType,
} from "@/lib/collection-schema";
import { COLLECTION_TEMPLATES } from "@/lib/collection-templates";
import { slugify } from "@/lib/slug";

const inputCls =
  "w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent";
const labelCls = "text-xs font-semibold uppercase tracking-wide opacity-60";

function deriveKey(label: string): string {
  const latin = slugify(label).replace(/-/g, "_").slice(0, 40);
  return /^[a-z]/.test(latin) ? latin : `field_${latin || "value"}`;
}

/** Черновик списка вариантов: запятые не «съедаются» до конца ввода. */
function OptionsInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string[] | undefined;
  disabled?: boolean;
  onChange: (options: string[] | undefined) => void;
}) {
  const join = (items: string[] | undefined) => (items ?? []).join(", ");
  const [draft, setDraft] = useState(join(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft((value ?? []).join(", "));
  }, [value]);

  return (
    <input
      id={id}
      value={draft}
      disabled={disabled}
      placeholder="Например: Новости, Гайд, Кейс"
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(join(value));
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const options = e.target.value
          .split(",")
          .map((option) => option.trim())
          .filter(Boolean);
        onChange(options.length > 0 ? options : undefined);
      }}
      className={inputCls}
    />
  );
}

export function SchemaEditor({
  value,
  onChange,
  idPrefix,
  disabled,
}: {
  value: CollectionField[];
  onChange: (fields: CollectionField[]) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  const [templateId, setTemplateId] = useState("");
  const check = checkCollectionSchema(JSON.stringify(value));

  const update = (index: number, patch: Partial<CollectionField>) => {
    onChange(value.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  const addField = () => {
    onChange([
      ...value,
      { key: "", label: "", type: "text", required: false },
    ]);
  };

  const removeField = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const applyTemplate = () => {
    const template = COLLECTION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    if (
      value.length > 0 &&
      !window.confirm(
        `Заменить текущие поля (${value.length}) полями шаблона «${template.name}»?`,
      )
    ) {
      return;
    }
    onChange(template.fields.map((field) => ({ ...field })));
    setTemplateId("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          <label htmlFor={`${idPrefix}-template`} className={labelCls}>
            Отраслевой шаблон
          </label>
          <select
            id={`${idPrefix}-template`}
            value={templateId}
            disabled={disabled}
            onChange={(e) => setTemplateId(e.target.value)}
            className={inputCls}
          >
            <option value="">Выберите отрасль…</option>
            {COLLECTION_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} — {template.description}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={applyTemplate}
          disabled={disabled || templateId === ""}
          className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:border-accent disabled:opacity-40"
        >
          Применить
        </button>
        <p className="w-full text-xs opacity-60">
          Шаблон заполнит поля ниже — их можно изменить под свой бизнес.
        </p>
      </div>

      {value.length === 0 ? (
        <div className="rounded-sm border border-dashed p-4 text-sm">
          <p className="font-semibold">Полей пока нет — это нормально</p>
          <p className="mt-1 opacity-60">
            Без полей запись хранит произвольный JSON (легаси-режим). Добавьте поля,
            чтобы получить удобную форму и серверную проверку.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {value.map((field, index) => {
            const base = `${idPrefix}-field-${index}`;
            return (
              <li key={index} className="rounded-sm border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-ink dark:text-accent-soft">
                    Поле {index + 1}
                  </span>
                  <span className="text-xs opacity-60">{FIELD_TYPE_LABELS[field.type]}</span>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveField(index, -1)}
                      disabled={disabled || index === 0}
                      aria-label={`Поднять поле ${index + 1}`}
                      className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, 1)}
                      disabled={disabled || index === value.length - 1}
                      aria-label={`Опустить поле ${index + 1}`}
                      className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      disabled={disabled}
                      aria-label={`Удалить поле ${index + 1}`}
                      className="rounded border border-red-500/50 px-2 py-0.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-500"
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${base}-label`} className={labelCls}>
                      Название *
                    </label>
                    <input
                      id={`${base}-label`}
                      value={field.label}
                      disabled={disabled}
                      placeholder="Например, Цена"
                      onChange={(e) => update(index, { label: e.target.value })}
                      onBlur={() => {
                        if (field.key.trim() === "") {
                          update(index, { key: deriveKey(field.label) });
                        }
                      }}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${base}-key`} className={labelCls}>
                      Ключ в API *
                    </label>
                    <input
                      id={`${base}-key`}
                      value={field.key}
                      disabled={disabled}
                      placeholder="price"
                      spellCheck={false}
                      onChange={(e) => update(index, { key: e.target.value })}
                      className={`${inputCls} font-mono`}
                      aria-describedby={`${base}-key-hint`}
                    />
                    <p id={`${base}-key-hint`} className="mt-1 text-[11px] opacity-60">
                      Латиница, цифры и _, начинается с буквы. Не меняйте у существующей схемы.
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`${base}-type`} className={labelCls}>
                      Тип
                    </label>
                    <select
                      id={`${base}-type`}
                      value={field.type}
                      disabled={disabled}
                      onChange={(e) =>
                        update(index, {
                          type: e.target.value as CollectionFieldType,
                          ...(e.target.value === "select" ? {} : { options: undefined }),
                        })
                      }
                      className={inputCls}
                    >
                      {COLLECTION_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {FIELD_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={field.required}
                      disabled={disabled}
                      onChange={(e) => update(index, { required: e.target.checked })}
                    />
                    Обязательное поле
                  </label>
                </div>

                {field.type === "select" && (
                  <div className="mt-2">
                    <label htmlFor={`${base}-options`} className={labelCls}>
                      Варианты списка *
                    </label>
                    <OptionsInput
                      id={`${base}-options`}
                      value={field.options}
                      disabled={disabled}
                      onChange={(options) => update(index, { options })}
                    />
                    <p className="mt-1 text-[11px] opacity-60">
                      Через запятую. Значения сохраняются в API как есть.
                    </p>
                  </div>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold opacity-70">
                    Подсказки и placeholder
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${base}-placeholder`} className={labelCls}>
                        Placeholder
                      </label>
                      <input
                        id={`${base}-placeholder`}
                        value={field.placeholder ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          update(index, { placeholder: e.target.value || undefined })
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${base}-help`} className={labelCls}>
                        Подсказка под полем
                      </label>
                      <input
                        id={`${base}-help`}
                        value={field.help ?? ""}
                        disabled={disabled}
                        onChange={(e) => update(index, { help: e.target.value || undefined })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addField}
          disabled={disabled}
          className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:border-accent disabled:opacity-50"
        >
          + Добавить поле
        </button>
        <span className="text-xs opacity-60" aria-live="polite">
          {value.length} {value.length === 1 ? "поле" : value.length >= 2 && value.length <= 4 ? "поля" : "полей"}
        </span>
      </div>

      {!check.ok && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {check.message}
        </p>
      )}
    </div>
  );
}
