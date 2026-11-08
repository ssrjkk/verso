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
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-md overflow-hidden rounded-2xl border bg-white dark:bg-white/5">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={title} className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-24 w-full items-center justify-center bg-[#f97316]/10 text-sm opacity-60">
            Нет og-изображения
          </div>
        )}
        <div className="p-4">
          <div className="text-xs uppercase tracking-wide opacity-50">{host || "example.com"}</div>
          <div className="mt-1 font-bold leading-snug">{title || "Заголовок страницы"}</div>
          <div className="mt-1 line-clamp-2 text-sm opacity-70">{description || "Описание для соцсетей и поисковиков…"}</div>
        </div>
      </div>
      <div className="max-w-md rounded-2xl border p-3 text-sm">
        <div className="font-semibold">Telegram / Twitter</div>
        <div className="mt-1 truncate font-bold">{title || "Заголовок"}</div>
        <div className="truncate opacity-60">{description || "Описание…"}</div>
        <div className="truncate text-xs text-[#f97316]">{url || "https://…"}</div>
      </div>
    </div>
  );
}
