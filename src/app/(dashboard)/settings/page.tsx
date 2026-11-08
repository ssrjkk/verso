"use client";
import { trpc } from "@/trpc/client";
import { useSession } from "@/lib/auth-client";
import { useState } from "react";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: keys } = trpc.apiKey.list.useQuery();
  const create = trpc.apiKey.create.useMutation({ onSuccess: () => utils.apiKey.list.invalidate() });
  const revoke = trpc.apiKey.revoke.useMutation({ onSuccess: () => utils.apiKey.list.invalidate() });
  const updateExpiry = trpc.apiKey.updateExpiry.useMutation({ onSuccess: () => utils.apiKey.list.invalidate() });

  const { data: webhooks = [] } = trpc.webhook.list.useQuery();
  const whCreate = trpc.webhook.create.useMutation({ onSuccess: () => utils.invalidate() });
  const whToggle = trpc.webhook.toggle.useMutation({ onSuccess: () => utils.invalidate() });
  const whRemove = trpc.webhook.remove.useMutation({ onSuccess: () => utils.invalidate() });
  const whTest = trpc.webhook.test.useMutation({
    onSuccess: (d) => {
      setTestResult(JSON.stringify(d));
      // lastStatus/lastDeliveryAt пишутся сервером до ответа mutation —
      // инвалидация сразу подтягивает их в строку endpoint'а.
      void utils.webhook.list.invalidate();
    },
  });

  const [name, setName] = useState("");
  const [scope, setScope] = useState<"READ" | "READ_WRITE">("READ");
  const [expiry, setExpiry] = useState("");
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  const [whForm, setWhForm] = useState({ name: "", url: "", secret: "", events: "entry.published,entry.updated" });
  const [testResult, setTestResult] = useState<string | null>(null);
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const { data: users } = trpc.user.list.useQuery(undefined, { enabled: isAdmin });
  const setRole = trpc.user.setRole.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
    onError: (e) => setUserError(e.message),
  });
  const [userError, setUserError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-extrabold">Настройки · API-ключи</h1>
        {lastRaw && (
          <div className="break-all rounded-xl border border-[#f97316] p-3 text-sm">
            Новый ключ (показывается один раз):{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono dark:bg-white/10">{lastRaw}</code>{" "}
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(lastRaw)}
              className="ml-2 rounded-lg border px-2 py-1 text-xs font-semibold hover:border-[#f97316]"
            >
              Скопировать
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название ключа…" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="rounded-lg border bg-transparent px-2 py-2 text-sm">
            <option value="READ">READ</option>
            <option value="READ_WRITE">READ_WRITE</option>
          </select>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded-lg border bg-transparent px-3 py-2 text-sm" title="Срок действия" />
          <button
            onClick={() => name && create.mutate(
              { name, scope, ...(expiry ? { expiresAt: new Date(expiry).toISOString() } : {}) },
              { onSuccess: (d) => { setLastRaw(d.raw); setName(""); setExpiry(""); } },
            )}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm text-white"
          >
            Выпустить
          </button>
        </div>
        {(keys ?? []).map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
            <span>
              {k.name} · {k.scope} · {k.prefix}… ·{" "}
              {k.expiresAt ? `до ${new Date(k.expiresAt).toLocaleDateString()}` : "бессрочный"} ·{" "}
              {k.lastUsedAt ? `использован ${new Date(k.lastUsedAt).toLocaleString()}` : "не использовался"}
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => {
                  const v = prompt("Новая дата expiry (YYYY-MM-DD) или пусто для бессрочного:", k.expiresAt ? new Date(k.expiresAt).toISOString().slice(0, 10) : "");
                  if (v !== null) updateExpiry.mutate({ id: k.id, expiresAt: v ? new Date(v).toISOString() : null });
                }}
                className="text-xs underline"
              >
                Expiry
              </button>
              <button onClick={() => { if (confirm(`Отозвать ${k.name}?`)) revoke.mutate({ id: k.id }); }} className="text-xs text-red-500">
                Отозвать
              </button>
            </span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-extrabold">Вебхуки</h2>
        {testResult && <pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl border p-2 text-xs">{testResult}</pre>}
        <div className="flex flex-wrap gap-2">
          <input value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} placeholder="Название" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <input value={whForm.url} onChange={(e) => setWhForm({ ...whForm, url: e.target.value })} placeholder="https://…" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <input value={whForm.secret} onChange={(e) => setWhForm({ ...whForm, secret: e.target.value })} placeholder="secret" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <input value={whForm.events} onChange={(e) => setWhForm({ ...whForm, events: e.target.value })} placeholder="events csv" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <button
            onClick={() => whForm.name && whForm.url && whCreate.mutate(whForm)}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm text-white"
          >
            Добавить
          </button>
        </div>
        {webhooks.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
            <span className="break-all">{w.name} · {w.url} · {w.events} · {w.isActive ? "активен" : "выкл"} · {w.lastStatus ? `статус ${w.lastStatus}` : "не доставлялся"}{w.lastDeliveryAt ? ` (${new Date(w.lastDeliveryAt).toLocaleString()})` : ""}</span>
            <span className="flex gap-2 text-xs">
              <button onClick={() => whToggle.mutate({ id: w.id, isActive: !w.isActive })} className="underline">
                {w.isActive ? "Выкл" : "Вкл"}
              </button>
              <button onClick={() => whTest.mutate({ id: w.id })} className="underline">Тест</button>
              <button onClick={() => { if (confirm(`Удалить ${w.name}?`)) whRemove.mutate({ id: w.id }); }} className="text-red-500">
                Удалить
              </button>
            </span>
          </div>
        ))}
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-4" aria-label="Пользователи">
          <h2 className="font-display text-xl font-extrabold">Пользователи</h2>
          {userError && (
            <p role="alert" className="rounded-xl border border-red-500/50 p-3 text-sm text-red-500">
              {userError}
            </p>
          )}
          {(users ?? []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <span className="break-all">
                {u.name} · {u.email}
              </span>
              <label className="flex items-center gap-2 text-xs">
                Роль
                <select
                  value={u.role}
                  aria-label={`Роль пользователя ${u.email}`}
                  onChange={(e) => {
                    setUserError(null);
                    if (e.target.value !== u.role) setRole.mutate({ userId: u.id, role: e.target.value as "ADMIN" | "MANAGER" | "VIEWER" });
                  }}
                  className="rounded-lg border bg-transparent px-2 py-1 text-sm"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </label>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
