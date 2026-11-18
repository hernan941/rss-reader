import { afterEach, describe, expect, it, vi } from "vitest";
import * as fetchModule from "../src/fetch";
import * as refreshModule from "../src/refresh";

const fetchText = (fetchModule as unknown as {
  fetchText: typeof import("../src/fetch").fetchText;
}).fetchText;
const parseRetryAfter = (fetchModule as unknown as {
  parseRetryAfter: (header: string | null, now: number) => number;
}).parseRetryAfter;
const RateLimitError = (fetchModule as unknown as {
  RateLimitError: new (status: number, retryAfterMs: number) => Error & { retryAfterMs: number };
}).RateLimitError;
const pickBatch = (refreshModule as unknown as {
  pickBatch: (feeds: import("../src/refresh").DueFeed[], maxPerHost: number) => import("../src/refresh").DueFeed[];
}).pickBatch;
const refreshFeed = refreshModule.refreshFeed;
const refreshDue = refreshModule.refreshDue;

afterEach(() => vi.unstubAllGlobals());

describe("Retry-After", () => {
  it("acota y convierte valores válidos", () => {
    const now = Date.parse("2026-10-21T04:28:00Z");
    expect(parseRetryAfter("120", now)).toBe(15 * 60_000);
    expect(parseRetryAfter("7200", now)).toBe(2 * 60 * 60_000);
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT", now)).toBe(3 * 60 * 60_000);
    expect(parseRetryAfter(null, now)).toBe(60 * 60_000);
    expect(parseRetryAfter("basura", now)).toBe(60 * 60_000);
    expect(parseRetryAfter("999999", now)).toBe(24 * 60 * 60_000);
  });

  it("429 lanza RateLimitError con el tiempo de reintento", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response("limited", { status: 429, headers: { "Retry-After": "7200" } }),
    );
    try {
      await fetchText("https://a.substack.com/feed");
      throw new Error("no lanzó");
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as Error & { retryAfterMs: number }).retryAfterMs).toBe(7_200_000);
      expect((error as Error).message).toBe("HTTP 429");
    }
  });
});

describe("pickBatch", () => {
  it("conserva el orden y limita por host", () => {
    const feeds = [
      { id: 1, url: "https://a.substack.com/feed", etag: "", last_modified: "" },
      { id: 2, url: "https://b.com/feed", etag: "", last_modified: "" },
      { id: 3, url: "https://a.substack.com/rss", etag: "", last_modified: "" },
      { id: 4, url: "https://c.com/feed", etag: "", last_modified: "" },
      { id: 5, url: "https://a.substack.com/atom", etag: "", last_modified: "" },
      { id: 6, url: "https://b.com/rss", etag: "", last_modified: "" },
      { id: 7, url: "https://a.substack.com/other", etag: "", last_modified: "" },
      { id: 8, url: "https://a.substack.com/last", etag: "", last_modified: "" },
    ];
    expect(pickBatch(feeds, 3).map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

function refreshDb() {
  let dueSql = "";
  let dueArgs: unknown[] = [];
  const updates: { sql: string; args: unknown[] }[] = [];
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind(...a: unknown[]) {
        args = a;
        return stmt;
      },
      async all() {
        if (sql.includes("FROM feeds f") && sql.includes("f.retry_after <= ?")) {
          dueSql = sql;
          dueArgs = args;
          return { results: [] };
        }
        return { results: [] };
      },
      async first() {
        return null;
      },
      async run() {
        updates.push({ sql, args });
        return {};
      },
    };
    return stmt;
  };
  return {
    db: { prepare, batch: async () => [] } as unknown as D1Database,
    updates,
    getDue: () => ({ sql: dueSql, args: dueArgs }),
  };
}

describe("refreshFeed", () => {
  it("guarda retry_after ante 429 y 503", async () => {
    for (const status of [429, 503]) {
      vi.stubGlobal("fetch", async () =>
        new Response("limited", { status, headers: { "Retry-After": "7200" } }),
      );
      const fake = refreshDb();
      await refreshFeed(fake.db, { id: 1, url: "https://a.substack.com/feed", etag: "", last_modified: "" }, 1_000);
      const update = fake.updates.find((u) => u.sql.includes("retry_after"));
      expect(update?.args).toContain(status === 429 ? "HTTP 429 (reintento en 120 min)" : "HTTP 503 (reintento en 120 min)");
      expect(update?.args).toContain(7_201_000);
      vi.unstubAllGlobals();
    }
  });

  it("un 304 limpia retry_after", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 304 }));
    const fake = refreshDb();
    await refreshFeed(fake.db, { id: 1, url: "https://a.test/feed", etag: "tag", last_modified: "" }, 1_000);
    expect(fake.updates[0].sql).toContain("retry_after = 0");
    expect(fake.updates[0].args).toEqual([1_000, 1]);
  });

  it("una respuesta 200 limpia retry_after", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>A</title><link>https://a.test/</link><description>A</description></channel></rss>`, {
        status: 200,
      }),
    );
    const fake = refreshDb();
    await refreshFeed(fake.db, { id: 1, url: "https://a.test/feed", etag: "", last_modified: "" }, 1_000);
    expect(fake.updates[0].sql).toContain("retry_after = 0");
  });

  it("conserva el error sin retry_after para fallos distintos", async () => {
    vi.stubGlobal("fetch", async () => new Response("fallo", { status: 500 }));
    const fake = refreshDb();
    await refreshFeed(fake.db, { id: 1, url: "https://a.test/feed", etag: "", last_modified: "" }, 1_000);
    expect(fake.updates[0].sql).not.toContain("retry_after");
    expect(fake.updates[0].args).toEqual([1_000, "HTTP 500", 1]);
  });

  it("refreshDue exige retry_after vencido", async () => {
    const fake = refreshDb();
    await refreshDue(fake.db, 600_000);
    expect(fake.getDue().sql).toContain("f.retry_after <= ?");
  });
});
