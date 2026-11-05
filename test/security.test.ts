import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchText } from "../src/fetch";
import worker from "../src/index";

/** D1 mínima: solo lo que usan el limitador de intentos y el estado del registro. */
function fakeDb() {
  const hits = new Map<string, { count: number; window_start: number }>();
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind(...a: unknown[]) {
        args = a;
        return stmt;
      },
      async first() {
        if (sql.includes("FROM throttle")) return hits.get(String(args[0])) ?? null;
        if (sql.includes("COUNT(*)")) return { n: 0 };
        return null;
      },
      async all() {
        return { results: [] };
      },
      async run() {
        if (sql.includes("INSERT INTO throttle")) {
          const key = String(args[0]);
          const row = hits.get(key);
          hits.set(key, { count: (row?.count ?? 0) + 1, window_start: row?.window_start ?? Date.now() });
        }
        return {};
      },
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}

const call = (url: string, init: RequestInit = {}, env: Record<string, unknown> = {}) =>
  (worker.fetch as any)(new Request(url, init), { DB: fakeDb(), ...env }, { waitUntil() {}, passThroughOnException() {} }) as Promise<Response>;

const BASE = "https://reader.hernan941.com";

describe("HTTPS", () => {
  it("redirige HTTP a HTTPS conservando ruta y consulta", async () => {
    const res = await call("http://reader.hernan941.com/login?x=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${BASE}/login?x=1`);
  });
  it("no redirige en desarrollo local", async () => {
    expect((await call("http://localhost:8787/login")).status).toBe(200);
  });
});

describe("cabeceras de seguridad", () => {
  it("se envían en las páginas", async () => {
    const res = await call(`${BASE}/login`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });
  it("no usan no-referrer, que convertiría el Origin de los formularios en null", async () => {
    expect((await call(`${BASE}/login`)).headers.get("referrer-policy")).toBe("same-origin");
  });
});

describe("CSRF", () => {
  const post = (origin: string) => call(`${BASE}/logout`, { method: "POST", headers: { origin } });

  it("rechaza otro origen", async () => {
    expect((await post("https://evil.example")).status).toBe(403);
  });
  it("rechaza Origin: null sin romperse", async () => {
    expect((await post("null")).status).toBe(403);
  });
  it("deja pasar el mismo origen hasta la comprobación de sesión", async () => {
    expect((await post(BASE)).status).toBe(401);
  });
});

describe("código de invitación", () => {
  it("bloquea los intentos repetidos, incluso si después aciertan", async () => {
    const env = { DB: fakeDb(), INVITE_CODE: "correcto" };
    const attempt = (invite: string) =>
      call(
        `${BASE}/register`,
        { method: "POST", body: new URLSearchParams({ invite, email: "a@b.co", password: "12345678" }) },
        env,
      ).then((r) => r.text());

    for (let i = 0; i < 5; i++) expect(await attempt("mal")).toContain("no es válido");
    expect(await attempt("mal")).toContain("Demasiados registros");
    expect(await attempt("correcto")).toContain("Demasiados registros");
  });
});

describe("tamaño de las respuestas", () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (chunks: Uint8Array[]) =>
    vi.stubGlobal("fetch", async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const chunk of chunks) c.enqueue(chunk);
            c.close();
          },
        }),
      ),
    );

  it("corta aunque el servidor no declare Content-Length", async () => {
    serve([new Uint8Array(3 * 1024 * 1024), new Uint8Array(3 * 1024 * 1024)]);
    await expect(fetchText("https://x.example/feed")).rejects.toThrow("demasiado grande");
  });
  it("conserva caracteres partidos entre fragmentos", async () => {
    const bytes = new TextEncoder().encode("añ");
    serve([bytes.slice(0, 2), bytes.slice(2)]);
    expect(await fetchText("https://x.example/feed")).toMatchObject({ status: "ok", body: "añ" });
  });
});
