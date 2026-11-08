"use client";

import { parseProps, DEFAULT_BLOCKS, type BlockType } from "./block-defaults";

const BLOCK_TYPES = ["HERO", "FEATURES", "PRICING", "FAQ", "RICH_TEXT", "GALLERY", "CODE", "CTA"] as const;

type AnyRecord = Record<string, unknown>;

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

// Безопасный href: режем javascript:/data:/vbscript: (stored XSS через CTA-ссылки).
// Разрешены http(s), mailto, tel, относительные пути, якоря.
export function asSafeHref(v: unknown, fallback = "#"): string {
  const s = asString(v, "");
  if (!s) return fallback;
  const t = s.trim();
  if (/^(https?:\/\/|\/|#)/i.test(t)) return t;
  if (/^(mailto|tel):/i.test(t)) return t;
  return fallback;
}

function asArray(v: unknown): AnyRecord[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is AnyRecord => !!x && typeof x === "object");
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

type GalleryImage = { src: string; alt: string };
function asGalleryImages(v: unknown): GalleryImage[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): GalleryImage[] => {
    if (typeof x === "string") return [{ src: x, alt: "" }];
    if (x && typeof x === "object") {
      const o = x as AnyRecord;
      return typeof o.src === "string" ? [{ src: o.src, alt: asString(o.alt) }] : [];
    }
    return [];
  });
}

function Hero(p: AnyRecord) {
  return (
    <section className="rounded-2xl border bg-gradient-to-br from-[#f97316]/10 via-transparent to-transparent p-8 text-center">
      {asString(p.eyebrow) ? (
        <div className="mb-2 inline-block rounded-full border border-[#f97316]/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a3412] dark:text-[#fb923c]">
          {asString(p.eyebrow)}
        </div>
      ) : null}
      <h2 className="font-display mx-auto max-w-2xl text-3xl font-extrabold leading-tight">
        {asString(p.title, "Заголовок")}
      </h2>
      {asString(p.subtitle) ? <p className="mx-auto mt-3 max-w-xl text-sm opacity-70">{asString(p.subtitle)}</p> : null}
      {asString(p.ctaLabel) ? (
        <a
          href={asSafeHref(p.ctaHref, "#")}
          className="mt-5 inline-block rounded-xl bg-[#c2410c] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#9a3412]"
        >
          {asString(p.ctaLabel)}
        </a>
      ) : null}
    </section>
  );
}

function Features(p: AnyRecord) {
  const items = asArray(p.items);
  return (
    <section className="rounded-2xl border p-6">
      {asString(p.title) ? <h3 className="font-display mb-4 text-xl font-bold">{asString(p.title)}</h3> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border bg-white/60 p-4 dark:bg-white/5">
            <div className="font-display font-bold">{asString(it.title, `Пункт ${i + 1}`)}</div>
            <div className="mt-1 text-sm opacity-70">{asString(it.text)}</div>
          </div>
        ))}
        {items.length === 0 ? <div className="text-sm opacity-60">Нет элементов</div> : null}
      </div>
    </section>
  );
}

function Pricing(p: AnyRecord) {
  const plans = asArray(p.plans);
  return (
    <section className="rounded-2xl border p-6">
      {asString(p.title) ? <h3 className="font-display mb-4 text-xl font-bold">{asString(p.title)}</h3> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((pl, i) => (
          <div
            key={i}
            className={`rounded-xl border p-5 ${pl.featured ? "border-[#f97316] ring-1 ring-[#f97316]" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-display font-bold">{asString(pl.name, `Тариф ${i + 1}`)}</div>
              {pl.featured ? (
                <span className="rounded-full bg-[#c2410c] px-2 py-0.5 text-xs font-semibold text-white">Популярный</span>
              ) : null}
            </div>
            <div className="font-display mt-2 text-2xl font-extrabold">{asString(pl.price)}</div>
            {asString(pl.period) ? <div className="text-xs opacity-60">{asString(pl.period)}</div> : null}
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {asStringArray(pl.features).map((f, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-[#9a3412] dark:text-[#fb923c]" aria-hidden="true">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {plans.length === 0 ? <div className="text-sm opacity-60">Нет тарифов</div> : null}
      </div>
    </section>
  );
}

function Faq(p: AnyRecord) {
  const items = asArray(p.items);
  return (
    <section className="rounded-2xl border p-6">
      {asString(p.title) ? <h3 className="font-display mb-4 text-xl font-bold">{asString(p.title)}</h3> : null}
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <details key={i} className="rounded-xl border px-4 py-2.5" open={i === 0}>
            <summary className="cursor-pointer font-semibold">{asString(it.q, `Вопрос ${i + 1}`)}</summary>
            <p className="mt-1.5 text-sm opacity-75">{asString(it.a)}</p>
          </details>
        ))}
        {items.length === 0 ? <div className="text-sm opacity-60">Нет вопросов</div> : null}
      </div>
    </section>
  );
}

function RichText(p: AnyRecord) {
  return (
    <section className="rounded-2xl border bg-white/60 p-6 dark:bg-white/5">
      {asString(p.title) ? <h3 className="font-display mb-3 text-xl font-bold">{asString(p.title)}</h3> : null}
      <div className="whitespace-pre-line text-sm leading-relaxed print:text-black">
        {asString(p.markdown, "Текст отсутствует")}
      </div>
    </section>
  );
}

function Gallery(p: AnyRecord) {
  const images = asGalleryImages(p.images);
  return (
    <section className="rounded-2xl border p-6">
      {asString(p.title) ? <h3 className="font-display mb-4 text-xl font-bold">{asString(p.title)}</h3> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {images.map((img, i) => (
          <img key={i} src={img.src} alt={img.alt || `Изображение ${i + 1}`} className="aspect-[4/3] w-full rounded-xl border object-cover" loading="lazy" />
        ))}
      </div>
      {images.length === 0 ? <div className="text-sm opacity-60">Нет изображений</div> : null}
    </section>
  );
}

function Code(p: AnyRecord) {
  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="flex items-center justify-between border-b bg-black/5 px-4 py-2 dark:bg-white/5">
        <span className="text-xs font-semibold">{asString(p.title, "Код")}</span>
        <span className="rounded bg-[#f97316]/15 px-2 py-0.5 font-mono text-xs text-[#9a3412] dark:text-[#fb923c]">
          {asString(p.language, "text")}
        </span>
      </div>
      <pre className="overflow-x-auto bg-black p-4 font-mono text-xs leading-relaxed text-green-200 print:bg-white print:text-black">
        {asString(p.code)}
      </pre>
    </section>
  );
}

function Cta(p: AnyRecord) {
  return (
    <section className="rounded-2xl bg-[#c2410c] p-8 text-center text-white">
      <h3 className="font-display text-2xl font-extrabold">{asString(p.title, "Призыв к действию")}</h3>
      {asString(p.text) ? <p className="mx-auto mt-2 max-w-lg text-sm text-white">{asString(p.text)}</p> : null}
      {asString(p.buttonLabel) ? (
        <a
          href={asSafeHref(p.buttonHref, "#")}
          className="mt-5 inline-block rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-[#c2410c]"
        >
          {asString(p.buttonLabel)}
        </a>
      ) : null}
    </section>
  );
}

export default function BlockRender({ type, propsJson }: { type: string; propsJson: string }) {
  const fallback: AnyRecord =
    (BLOCK_TYPES as readonly string[]).includes(type)
      ? (DEFAULT_BLOCKS[type as BlockType] as unknown as AnyRecord)
      : {};
  let parsed: AnyRecord;
  try {
    const raw = JSON.parse(propsJson) as unknown;
    parsed = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as AnyRecord) : fallback;
  } catch {
    parsed = fallback;
  }
  // parseProps держит контракт безопасного парсинга для переиспользования
  parsed = { ...parseProps(JSON.stringify(parsed), fallback as object) } as AnyRecord;

  switch (type) {
    case "HERO":
      return <Hero {...parsed} />;
    case "FEATURES":
      return <Features {...parsed} />;
    case "PRICING":
      return <Pricing {...parsed} />;
    case "FAQ":
      return <Faq {...parsed} />;
    case "RICH_TEXT":
      return <RichText {...parsed} />;
    case "GALLERY":
      return <Gallery {...parsed} />;
    case "CODE":
      return <Code {...parsed} />;
    case "CTA":
      return <Cta {...parsed} />;
    default:
      return (
        <section className="rounded-2xl border border-dashed p-4 text-sm opacity-70">
          Неизвестный тип блока: {type}
        </section>
      );
  }
}
