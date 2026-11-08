"use client";
import { trpc } from "@/trpc/client";
import { useState } from "react";
import OgPreview from "@/components/seo/OgPreview";
import { isValidSlug } from "@/lib/slug";

export default function SeoPage() {
  const utils = trpc.useUtils();
  const { data } = trpc.seo.redirects.useQuery();
  const upsert = trpc.seo.upsertRedirect.useMutation({ onSuccess: () => utils.seo.redirects.invalidate() });
  const remove = trpc.seo.removeRedirect.useMutation({ onSuccess: () => utils.seo.redirects.invalidate() });
  const toggle = trpc.seo.toggleRedirect.useMutation({ onSuccess: () => utils.seo.redirects.invalidate() });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [code, setCode] = useState<301 | 302>(301);
  const [og, setOg] = useState({ title: "", description: "", image: "", url: "" });
  const [sitemap, setSitemap] = useState<string | null>(null);

  const slugHint = from.replace(/^\//, "").split("/").pop() ?? "";
  const slugOk = !slugHint || isValidSlug(slugHint);

  async function loadSitemap() {
    const res = await fetch("/api/sitemap.xml");
    const text = await res.text();
    setSitemap(text.slice(0, 2000));
  }

  async function downloadSitemap() {
    const res = await fetch("/api/sitemap.xml");
    const text = await res.text();
    const blob = new Blob([text], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sitemap.xml";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const titleLen = og.title.length;
  const descLen = og.description.length;
  const titleColor = titleLen === 0 ? "opacity-60" : titleLen <= 50 ? "text-emerald-500" : titleLen <= 60 ? "text-amber-500" : "text-red-600 dark:text-red-500";
  const descColor = descLen === 0 ? "opacity-60" : descLen <= 140 ? "text-emerald-500" : descLen <= 160 ? "text-amber-500" : "text-red-600 dark:text-red-500";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold">SEO · редиректы</h1>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/old-path" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="/new-path" className="rounded-lg border bg-transparent px-3 py-2 text-sm" />
          <select value={code} onChange={(e) => setCode(Number(e.target.value) as 301 | 302)} aria-label="Код статуса редиректа" className="rounded-lg border bg-transparent px-2 py-2 text-sm">
            <option value={301}>301</option>
            <option value={302}>302</option>
          </select>
          <button
            onClick={() => from && to && upsert.mutate({ fromPath: from, toPath: to, statusCode: code })}
            className="rounded-lg bg-[#c2410c] px-4 py-2 text-sm text-white hover:bg-[#9a3412]"
          >
            Добавить
          </button>
        </div>
        <p className="text-xs opacity-60">
          Slug: только a-z, 0-9 и дефисы, без кириллицы и пробелов. Транслит: «Новости компании» → «novosti-kompanii».
          {!slugOk && <span className="text-red-600 dark:text-red-500"> Текущий slug «{slugHint}» невалиден.</span>}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        {(data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
            <span>{r.fromPath} → {r.toPath}</span>
            <span className="flex items-center gap-2 opacity-80">
              <span>{r.statusCode} · {r.isActive ? "активен" : "выкл"}</span>
              <span className="rounded-full bg-[#f97316]/12 px-2 py-0.5 text-[11px] font-bold text-[#9a3412] dark:text-[#f97316]">
                hits {r.hits}
              </span>
              <button onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })} className="rounded border px-2 py-0.5 text-xs">
                {r.isActive ? "Выкл" : "Вкл"}
              </button>
              <button onClick={() => { if (confirm(`Удалить ${r.fromPath}?`)) remove.mutate({ id: r.id }); }} className="text-xs text-red-600 dark:text-red-500">
                Удалить
              </button>
            </span>
          </div>
        ))}
        {!data?.length && <p className="text-sm opacity-60">Редиректов пока нет.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">OG-превью</h2>
        <div className="flex flex-wrap gap-2">
          {(["title", "description", "image", "url"] as const).map((k) => (
            <input
              key={k}
              value={og[k]}
              onChange={(e) => setOg({ ...og, [k]: e.target.value })}
              placeholder={k}
              maxLength={k === "title" ? 120 : k === "description" ? 300 : undefined}
              aria-label={`OG ${k}`}
              className="rounded-lg border bg-transparent px-3 py-2 text-sm"
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className={titleColor}>title: {titleLen}/60</span>
          <span className={descColor}>description: {descLen}/160</span>
        </div>
        <OgPreview {...og} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Sitemap</h2>
        <div className="flex gap-2">
          <button onClick={loadSitemap} className="rounded-lg border px-4 py-2 text-sm">Предпросмотр</button>
          <button onClick={downloadSitemap} className="rounded-lg bg-[#c2410c] px-4 py-2 text-sm text-white hover:bg-[#9a3412]">Скачать</button>
        </div>
        {sitemap && <pre className="max-h-64 overflow-auto rounded-xl border p-3 text-xs">{sitemap}</pre>}
      </section>
    </div>
  );
}
