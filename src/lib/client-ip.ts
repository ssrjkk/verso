import { isIP } from "node:net";

/**
 * IP клиента для лимитов и телеметрии за reverse proxy.
 *
 * `X-Forwarded-For` — это цепочка: каждый доверенный прокси добавляет адрес
 * соседа, который к нему подключился. Клиент находится на расстоянии
 * `TRUSTED_PROXY_HOPS` от правого края, а не в начале списка: левые элементы
 * мог прислать сам клиент. Доверять первому элементу нельзя — иначе один
 * клиент подставляет любой IP и обходит лимит.
 *
 * `TRUSTED_PROXY_HOPS` — сколько прокси перед приложением (по умолчанию 1,
 * как в рекомендуемой топологии Caddy/Nginx → Next.js). `0` — приложение
 * смотрит в интернет напрямую: заголовки клиента игнорируются, все запросы
 * получают общий ключ `direct`. Некорректное значение откатывается к 1,
 * чтобы опечатка не открывала обход лимита.
 */
const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_TRUSTED_PROXY_HOPS = 10;

export function trustedProxyHops(
  raw: string | undefined = process.env.TRUSTED_PROXY_HOPS,
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TRUSTED_PROXY_HOPS;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_TRUSTED_PROXY_HOPS) {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  return hops;
}

export function getClientIp(
  headers: Headers,
  hops: number = trustedProxyHops(),
): string {
  if (hops === 0) return "direct";

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded && forwarded.trim() !== "") {
    const chain = forwarded.split(",").map((part) => part.trim());
    // Цепочка короче настроенного числа прокси означает, что запрос пришёл
    // не через ожидаемую инфраструктуру. Не доверяем ни одному элементу.
    if (chain.length < hops) return "unknown";
    const candidate = chain[chain.length - hops];
    return candidate && isIP(candidate) ? candidate : "unknown";
  }

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp && isIP(realIp) ? realIp : "unknown";
}
