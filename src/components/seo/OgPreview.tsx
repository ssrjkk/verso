"use client";

import { safeImageUrl } from "@/lib/og-image";

type Props = {
  title: string;
  description: string;
  image?: string;
  url: string;
};

export default function OgPreview({ title, description, image, url }: Props) {
  // Относительный путь (/p/collection/slug) превращаем в абсолютный только
  // для разбора hostname; в подписи оставляем человеческий путь.
  const absolute = url.startsWith("/") && typeof window !== "undefined"
    ? `${window.location.origin}${url}`
    : url;
  let host = url;
  try {
    const parsed = new URL(absolute);
    host = parsed.hostname + parsed.pathname;
  } catch {
    host = url;
  }
  const imageUrl = safeImageUrl(image);
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-md overflow-hidden rounded-sm border border-ink-950/15 bg-paper-raised dark:border-white/15 dark:bg-white/5">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-24 w-full items-center justify-center bg-accent/10 text-sm text-stone-600 dark:text-stone-300">
            Нет og-изображения
          </div>
        )}
        <div className="p-4">
          <div className="text-xs uppercase tracking-wide text-stone-600 dark:text-stone-400">{host || "адрес страницы"}</div>
          <div className="mt-1 font-bold leading-snug">{title || "Заголовок страницы"}</div>
          <div className="mt-1 line-clamp-2 text-sm opacity-70">{description || "Описание для соцсетей и поисковиков…"}</div>
        </div>
      </div>
      <div className="max-w-md rounded-sm border p-3 text-sm">
        <div className="font-semibold">Telegram / Twitter</div>
        <div className="mt-1 truncate font-bold">{title || "Заголовок"}</div>
        <div className="truncate opacity-60">{description || "Описание…"}</div>
        <div className="truncate text-xs text-accent-ink dark:text-accent-soft">{url || "https://…"}</div>
      </div>
    </div>
  );
}
