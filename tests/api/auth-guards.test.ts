import { describe, it, expect } from "vitest";
import { POST as uploadPOST } from "@/app/api/upload/route";
import { GET as v1GET } from "@/app/api/v1/[collection]/route";
import { NextRequest } from "next/server";

describe("API guards, без БД", () => {
  it("POST /api/upload без сессии -> 403 (аноним и VIEWER не пишут)", async () => {
    const req = new NextRequest("http://localhost/api/upload", { method: "POST" });
    const res = await uploadPOST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("GET /api/v1/:collection без ключа -> 401", async () => {
    const req = new NextRequest("http://localhost/api/v1/posts", { method: "GET" });
    const res = await v1GET(req, { params: Promise.resolve({ collection: "posts" }) });
    expect(res.status).toBe(401);
  });
});
