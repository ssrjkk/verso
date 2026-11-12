import { createHmac } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { PrismaClient } from "@prisma/client";

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 200;

// Флаг разрешён ТОЛЬКО явному тестовому харнессу (VERSO_TEST_HARNESS=1).
// В проде с ним процесс обязан упасть, а не молча ходить по внутренней сети.
if (
  process.env.NODE_ENV === "production" &&
  process.env.WEBHOOK_ALLOW_PRIVATE === "1" &&
  process.env.VERSO_TEST_HARNESS !== "1" &&
  !process.env.NEXT_PHASE?.includes("build")
) {
  throw new Error("WEBHOOK_ALLOW_PRIVATE must never be enabled in production");
}

function allowPrivate() {
  return process.env.WEBHOOK_ALLOW_PRIVATE === "1";
}

/** Приватные, loopback, link-local, multicast и зарезервированные диапазоны. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // fc00::/7
  if (/^fe[89ab]/.test(v6)) return true; // fe80::/10
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice("::ffff:".length));
  if (v6.startsWith("64:ff9b:")) return true; // NAT64
  return false;
}

/** Десятичный/шестнадцатеричный IPv4 (2130706433 → 127.0.0.1). */
function numericIpv4(host: string): string | null {
  let value: number | null = null;
  if (/^\d+$/.test(host)) value = Number(host);
  else if (/^0x[0-9a-f]+$/i.test(host)) value = Number.parseInt(host.slice(2), 16);
  if (value === null || !Number.isFinite(value) || value < 0 || value > 0xffffffff) return null;
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

/**
 * Синтаксическая проверка URL вебхука.
 * DNS/private-проверка — в момент доставки (иначе DNS-rebinding обходит её).
 */
export function validateWebhookUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: `URL длиннее ${MAX_URL_LENGTH} символов` };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Некорректный URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Разрешены только http(s)" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URL не должен содержать user:pass@" };
  }
  if (!url.hostname) return { ok: false, reason: "URL без hostname" };
  return { ok: true, url };
}

type ResolvedTarget = { address: string; family: 4 | 6 };

/** Резолв + выбор только публичного адреса. */
export async function resolveTarget(hostname: string, allowPrivateAddresses = allowPrivate()): Promise<ResolvedTarget> {
  const numeric = numericIpv4(hostname);
  if (numeric) {
    if (!allowPrivateAddresses && isPrivateIp(numeric)) {
      throw new Error(`Заблокирован приватный адрес: ${hostname}`);
    }
    return { address: numeric, family: 4 };
  }
  if (net.isIP(hostname)) {
    if (!allowPrivateAddresses && isPrivateIp(hostname)) {
      throw new Error(`Заблокирован приватный адрес: ${hostname}`);
    }
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  const usable = records.filter((r) => allowPrivateAddresses || !isPrivateIp(r.address));
  if (usable.length === 0) {
    throw new Error(`Заблокирован приватный адрес: ${hostname}`);
  }
  const pick = usable[0];
  return { address: pick.address, family: pick.family === 6 ? 6 : 4 };
}

type Headers = Record<string, string>;

/**
 * Одна доставка с ручными редиректами (≤3): каждый hop проходит заново
 * синтаксическую проверку и DNS-резолв. Соединение идёт на проверенный IP,
 * hostname остаётся в Host/SNI — DNS-rebinding не успевает подменить адрес.
 */
export async function sendWebhook(
  rawUrl: string,
  body: string,
  headers: Headers,
  opts: { timeoutMs?: number; resolve?: (hostname: string) => Promise<ResolvedTarget> } = {},
): Promise<number> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resolve = opts.resolve ?? resolveTarget;
  let current = validateWebhookUrl(rawUrl);
  if (!current.ok) throw new Error(current.reason);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const pageUrl = current.url;
    const target = await resolve(pageUrl.hostname);
    const response = await new Promise<{ status: number; location?: string }>((resolve, reject) => {
      const onResponse = (res: http.IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        // Тело не читаем и не буферизуем.
        res.destroy();
        resolve({ status, location });
      };
      const options = {
        method: "POST",
        headers: { ...headers, "content-length": String(Buffer.byteLength(body)) },
        timeout: timeoutMs,
        autoSelectFamily: false,
        lookup: (
          _hostname: string,
          _opts: dns.LookupOptions,
          cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
        ) => cb(null, target.address, target.family),
      };
      const req =
        pageUrl.protocol === "https:"
          ? https.request(
              pageUrl,
              { ...options, servername: pageUrl.hostname },
              onResponse,
            )
          : http.request(pageUrl, options, onResponse);
      req.on("timeout", () => req.destroy(new Error(`Таймаут вебхука (${timeoutMs} мс)`)));
      req.on("error", reject);
      req.end(body);
    });

    if (response.status >= 300 && response.status < 400 && response.location) {
      if (hop === MAX_REDIRECTS) throw new Error("Слишком много редиректов");
      const next = validateWebhookUrl(new URL(response.location, pageUrl).toString());
      if (!next.ok) throw new Error(`Недопустимый редирект: ${next.reason}`);
      current = next;
      continue;
    }
    return response.status;
  }
  throw new Error("Слишком много редиректов");
}

export type DeliveryResult = { ok: boolean; status: number; error?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Доставка с повторами и backoff. Тело ответа не читается. */
export async function deliverWebhook(
  endpoint: { url: string; secret: string },
  event: string,
  payload: unknown,
  opts?: { attempts?: number; timeoutMs?: number; backoffMs?: number },
): Promise<DeliveryResult> {
  const body = JSON.stringify({ event, data: payload });
  const headers: Headers = {
    "content-type": "application/json",
    "x-verso-event": event,
    "x-verso-sign": `sha256=${createHmac("sha256", endpoint.secret).update(body).digest("hex")}`,
  };
  const attempts = opts?.attempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoffMs = opts?.backoffMs ?? DEFAULT_BACKOFF_MS;

  let status = 0;
  let error: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      status = await sendWebhook(endpoint.url, body, headers, { timeoutMs });
      error = undefined;
      if (status >= 200 && status < 300) break;
      error = `HTTP ${status}`;
    } catch (e) {
      status = 0;
      error = e instanceof Error ? e.message : "delivery failed";
    }
    if (attempt < attempts) await sleep(backoffMs * attempt);
  }
  return { ok: status >= 200 && status < 300, status, ...(error ? { error } : {}) };
}

/**
 * Постановка доставки после коммита. Возвращает управление сразу:
 * публикация не ждёт сеть. lastStatus/lastDeliveryAt пишутся по факту.
 */
export function fireWebhooks(prisma: PrismaClient, event: string, payload: unknown): void {
  void (async () => {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({ where: { isActive: true } });
      const targets = endpoints.filter((e) =>
        e.events.split(",").map((s) => s.trim()).includes(event),
      );
      await Promise.allSettled(
        targets.map(async (endpoint) => {
          const result = await deliverWebhook(endpoint, event, payload);
          await prisma.webhookEndpoint
            .update({
              where: { id: endpoint.id },
              data: { lastStatus: String(result.status), lastDeliveryAt: new Date() },
            })
            .catch(() => undefined);
        }),
      );
    } catch {
      // вебхуки не должны ронять публикацию
    }
  })();
}

/** Кнопка «Тест»: та же защита, что и у обычной доставки. */
export async function testWebhook(
  prisma: PrismaClient,
  endpoint: { id: string; url: string; secret: string; name: string },
): Promise<DeliveryResult> {
  const payload = { event: "ping", at: new Date().toISOString(), endpoint: endpoint.name };
  const result = await deliverWebhook(endpoint, "ping", payload, { attempts: 1 });
  await prisma.webhookEndpoint
    .update({
      where: { id: endpoint.id },
      data: { lastStatus: String(result.status), lastDeliveryAt: new Date() },
    })
    .catch(() => undefined);
  return result;
}
