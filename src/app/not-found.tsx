import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 p-6 text-center text-stone-100">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">404</p>
      <h1 className="font-display text-3xl font-extrabold">Страница не найдена</h1>
      <p className="max-w-md text-sm text-stone-400">
        Такой страницы нет или у вас нет к ней доступа.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-sm bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-deep focus-visible:outline-none"
      >
        На главную
      </Link>
    </main>
  );
}
