"use client";

type Props = {
  title: string;
  description: string;
  image?: string;
  url: string;
};

export default function OgPreview({ title, description, image, url }: Props) {
  let host = url;
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname + new URL(url.startsWith("http") ? url : `https://${url}`).pathname;
  } catch {
    host = url;
  }
  // og:image приходит из формы, поэтому в <img src> идёт только http(s)-адрес:
  // javascript:/data:/file: отсекаются вместе с непарсящимися строками.
  let imageUrl = "";
  try {
    const parsed = new URL((image ?? "").startsWith("http") ? (image ?? "") : `https://${image}`);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") imageUrl = parsed.href;
  } catch {
    imageUrl = "";
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-md overflow-hidden rounded-2xl border bg-white dark:bg-white/5">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-24 w-full items-center justify-center bg-[#f97316]/10 text-sm text-neutral-600 dark:text-neutral-300">
            Нет og-изображения
          </div>
        )}
        <div className="p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{host || "example.com"}</div>
          <div className="mt-1 font-bold leading-snug">{title || "Заголовок страницы"}</div>
          <div className="mt-1 line-clamp-2 text-sm opacity-70">{description || "Описание для соцсетей и поисковиков…"}</div>
        </div>
      </div>
      <div className="max-w-md rounded-2xl border p-3 text-sm">
        <div className="font-semibold">Telegram / Twitter</div>
        <div className="mt-1 truncate font-bold">{title || "Заголовок"}</div>
        <div className="truncate opacity-60">{description || "Описание…"}</div>
        <div className="truncate text-xs text-[#9a3412] dark:text-[#f97316]">{url || "https://…"}</div>
      </div>
    </div>
  );
}
