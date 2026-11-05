import { describe, expect, it } from "vitest";
import { hashPassword, validEmail, verifyPassword } from "../src/auth";
import { buildOpml, parseOpml } from "../src/opml";

describe("contraseñas", () => {
  it("acepta la correcta y rechaza la incorrecta", async () => {
    const h = await hashPassword("secreto-123", 1000);
    expect(h.startsWith("pbkdf2$1000$")).toBe(true);
    expect(await verifyPassword("secreto-123", h)).toBe(true);
    expect(await verifyPassword("otra-cosa", h)).toBe(false);
  });
  it("usa sal distinta cada vez", async () => {
    expect(await hashPassword("x", 1000)).not.toBe(await hashPassword("x", 1000));
  });
  it("rechaza hashes mal formados", async () => {
    expect(await verifyPassword("x", "basura")).toBe(false);
  });
  it("valida correos", () => {
    expect(validEmail("a@b.co")).toBe(true);
    expect(validEmail("sin-arroba")).toBe(false);
    expect(validEmail("a b@c.d")).toBe(false);
  });
});

describe("OPML con carpetas", () => {
  const opml = `<opml><body>
    <outline text="Tech"><outline text="A" xmlUrl="https://a.test/rss"/></outline>
    <outline text="Suelta" xmlUrl="https://b.test/rss"/></body></opml>`;
  it("conserva las carpetas al importar", () => {
    expect(parseOpml(opml)).toEqual([
      { url: "https://a.test/rss", title: "A", folder: "Tech" },
      { url: "https://b.test/rss", title: "Suelta", folder: "" },
    ]);
  });
  it("las exporta de vuelta", () => {
    const out = buildOpml([
      { id: 1, name: "A", url: "https://a.test/rss", site_url: "", favicon_url: "", last_error: "", folder: "Tech", unread: 0 },
      { id: 2, name: "B & C", url: "https://b.test/rss", site_url: "", favicon_url: "", last_error: "", folder: "", unread: 0 },
    ]);
    expect(out).toContain('<outline text="Tech"');
    expect(out).toContain('text="B &amp; C"');
    expect(parseOpml(out).map((f) => f.folder)).toEqual(["Tech", ""]);
  });
});

import { isAdmin } from "../src/admin";

describe("isAdmin", () => {
  const env = { ADMIN_EMAILS: " Yo@Test.dev , otra@test.dev " };
  it("compara sin mayúsculas ni espacios", () => {
    expect(isAdmin("yo@test.dev", env)).toBe(true);
    expect(isAdmin("OTRA@test.dev", env)).toBe(true);
  });
  it("nadie es admin si no está configurado", () => {
    expect(isAdmin("yo@test.dev", {})).toBe(false);
    expect(isAdmin("yo@test.dev", { ADMIN_EMAILS: "" })).toBe(false);
  });
  it("no acepta coincidencias parciales", () => {
    expect(isAdmin("yo@test.de", env)).toBe(false);
    expect(isAdmin("xyo@test.dev", env)).toBe(false);
  });
});
