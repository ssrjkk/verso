import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  deliverWebhook,
  isPrivateIp,
  resolveTarget,
  sendWebhook,
  validateWebhookUrl,
} from "@/lib/webhook";

let servers: Server[] = [];

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return { server, port: addr.port };
}

function closeAll() {
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
  servers = [];
}

const saved = process.env.WEBHOOK_ALLOW_PRIVATE;

beforeEach(() => {
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
});

afterEach(() => {
  closeAll();
  if (saved === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE;
  else process.env.WEBHOOK_ALLOW_PRIVATE = saved;
});

describe("validateWebhookUrl", () => {
  it("принимает http(s)", () => {
    expect(validateWebhookUrl("https://example.com/hook").ok).toBe(true);
    expect(validateWebhookUrl("http://example.com:8080/hook").ok).toBe(true);
  });

  it.each([
    "ftp://example.com/hook",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pass@example.com/hook",
    `https://example.com/${"a".repeat(2048)}`,
  ])("отклоняет %s", (url) => {
    expect(validateWebhookUrl(url).ok).toBe(false);
  });
});

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("считает приватным %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])("считает публичным %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("SSRF-защита резолва", () => {
  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "::1",
    "10.0.0.1",
    "0.0.0.0",
    "2130706433",
  ])("блокирует %s", async (host) => {
    await expect(resolveTarget(host)).rejects.toThrow(/приватн|Заблокирован/);
  });

  it("блокирует hostname, резолвящийся в приватный IP (localhost)", async () => {
    await expect(resolveTarget("localhost")).rejects.toThrow(/приватн|Заблокирован/);
  });

  it("при WEBHOOK_ALLOW_PRIVATE=1 пропускает приватный адрес (только харнесс)", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "1";
    const target = await resolveTarget("127.0.0.1");
    expect(target.address).toBe("127.0.0.1");
  });
});

describe("доставка", () => {
  it("без флага не соединяется с 127.0.0.1", async () => {
    const { port } = await listen((_req, res) => res.end("ok"));
    await expect(sendWebhook(`http://127.0.0.1:${port}/hook`, "{}", {}, { timeoutMs: 500 })).rejects.toThrow(
      /приватн|Заблокирован/,
    );
  });

  it("с флагом доставляет на локальный echo и не читает тело", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "1";
    let hit = 0;
    const { port } = await listen((req, res) => {
      hit += 1;
      req.resume();
      res.statusCode = 200;
      res.write("partial");
      // Намеренно не завершаем тело: доставка должна закрыться по заголовкам.
    });
    const status = await sendWebhook(`http://127.0.0.1:${port}/hook`, "{}", {}, { timeoutMs: 1000 });
    expect(status).toBe(200);
    expect(hit).toBe(1);
  });

  it("блокирует редирект на metadata-адрес (повторная проверка hop)", async () => {
    let hits = 0;
    const { port } = await listen((_req, res) => {
      hits += 1;
      res.statusCode = 302;
      res.setHeader("location", "http://169.254.169.254/latest/meta-data/");
      res.end();
    });
    // Резолвер подменяет только public.test → 127.0.0.1 (имитация DNS-rebinding);
    // остальные хосты идут через настоящую проверку.
    const resolve = async (host: string) => {
      if (host === "public.test") return { address: "127.0.0.1", family: 4 as const };
      return resolveTarget(host);
    };
    await expect(
      sendWebhook(`http://public.test:${port}/redirect`, "{}", {}, { timeoutMs: 1000, resolve }),
    ).rejects.toThrow(/приватн|Заблокирован/);
    expect(hits).toBe(1);
  });

  it("зависший сервер упирается в таймаут, а не в вечность", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "1";
    const { port } = await listen(() => {
      /* никогда не отвечаем */
    });
    const started = Date.now();
    await expect(
      sendWebhook(`http://127.0.0.1:${port}/hang`, "{}", {}, { timeoutMs: 150 }),
    ).rejects.toThrow(/Таймаут/);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("делает до 3 попыток с backoff и фиксирует успех", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "1";
    let hits = 0;
    const { port } = await listen((req, res) => {
      hits += 1;
      req.resume();
      res.statusCode = hits < 3 ? 500 : 200;
      res.end("x");
    });
    const result = await deliverWebhook(
      { url: `http://127.0.0.1:${port}/retry`, secret: "s" },
      "entry.published",
      { id: 1 },
      { attempts: 3, timeoutMs: 500, backoffMs: 10 },
    );
    expect(result).toEqual({ ok: true, status: 200 });
    expect(hits).toBe(3);
  });
});
