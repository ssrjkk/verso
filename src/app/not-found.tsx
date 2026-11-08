import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#12121a] p-6 text-center text-neutral-100">
      <p className="text-sm font-semibold uppercase tracking-widest text-[#f97316]">404</p>
      <h1 className="font-display text-3xl font-extrabold">Страница не найдена</h1>
      <p className="max-w-md text-sm text-neutral-400">
        Такой страницы нет или у вас нет к ней доступа.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-xl bg-[#c2410c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#9a3412] focus-visible:outline-none"
      >
        На главную
      </Link>
    </main>
  );
}
