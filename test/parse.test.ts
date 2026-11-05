import { describe, expect, it } from "vitest";
import { findFeedLinks, parseFeed, stripHtml } from "../src/parse";
import { parseOpml } from "../src/opml";

const NOW = Date.parse("2026-01-10T00:00:00Z");

describe("parseFeed", () => {
  it("lee RSS 2.0 con imagen en contenido y fechas futuras recortadas", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <title>Mi Blog</title><link>https://blog.test/</link>
      <item><title>Hola &amp; adiós</title><link>/p/1</link><guid>g1</guid>
        <pubDate>Mon, 05 Jan 2026 10:00:00 GMT</pubDate>
        <description><![CDATA[<p>Texto <b>largo</b> &amp; más</p>]]></description>
        <content:encoded><![CDATA[<img src="/img/a.jpg"><p>x</p>]]></content:encoded></item>
      <item><title>Futuro</title><link>https://blog.test/p/2</link><pubDate>Mon, 05 Jan 2099 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const f = parseFeed(xml, "https://blog.test/feed", NOW)!;
    expect(f.title).toBe("Mi Blog");
    expect(f.siteUrl).toBe("https://blog.test/");
    expect(f.entries).toHaveLength(2);
    expect(f.entries[0]).toMatchObject({
      guid: "g1",
      title: "Hola & adiós",
      link: "https://blog.test/p/1",
      summary: "Texto largo & más",
      image: "https://blog.test/img/a.jpg",
    });
    expect(f.entries[1].publishedAt).toBe(NOW);
  });

  it("lee Atom", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
      <link rel="self" href="https://a.test/atom"/><link rel="alternate" href="https://a.test/"/>
      <entry><title type="html">Uno</title><id>tag:a,1</id><link href="https://a.test/1"/>
        <updated>2026-01-02T00:00:00Z</updated><summary>Resumen</summary></entry></feed>`;
    const f = parseFeed(xml, "https://a.test/atom", NOW)!;
    expect(f.siteUrl).toBe("https://a.test/");
    expect(f.entries[0]).toMatchObject({ guid: "tag:a,1", link: "https://a.test/1", summary: "Resumen" });
    expect(f.entries[0].publishedAt).toBe(Date.parse("2026-01-02T00:00:00Z"));
  });

  it("devuelve null si no es un feed", () => {
    expect(parseFeed("<html><body>hola</body></html>", "https://x.test")).toBeNull();
    expect(parseFeed("no es xml", "https://x.test")).toBeNull();
  });
});

describe("helpers", () => {
  it("encuentra feeds en HTML", () => {
    const html = `<head><link rel="alternate" type="application/rss+xml" href="/rss.xml">
      <link rel="stylesheet" href="/a.css"></head>`;
    expect(findFeedLinks(html, "https://s.test/blog/")).toEqual(["https://s.test/rss.xml"]);
  });
  it("limpia HTML y recorta", () => {
    expect(stripHtml("<p>a&nbsp;b</p><script>x()</script>")).toBe("a b");
    expect(stripHtml("palabra ".repeat(100), 20).endsWith("…")).toBe(true);
  });
  it("lee OPML anidado", () => {
    const opml = `<opml><body><outline text="Cat"><outline text="A" xmlUrl="https://a.test/rss"/></outline>
      <outline text="B" xmlUrl="b.test/feed"/></body></opml>`;
    expect(parseOpml(opml)).toEqual([
      { url: "https://a.test/rss", title: "A", folder: "Cat" },
      { url: "https://b.test/feed", title: "B", folder: "" },
    ]);
  });
});
