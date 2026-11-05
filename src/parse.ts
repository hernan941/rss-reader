import { XMLParser } from "fast-xml-parser";

export interface ParsedEntry {
  guid: string;
  title: string;
  link: string;
  summary: string;
  image: string;
  publishedAt: number | null;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string;
  entries: ParsedEntry[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  trimValues: true,
});

type Node = any;

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

function text(v: Node): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  return text(v["#text"]);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(html: string, max = 280): string {
  const plain = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, "") + "…" : plain;
}

function absolute(url: string, base: string): string {
  try {
    const u = new URL(url.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function parseDate(v: string, now: number): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.min(t, now); // fechas futuras se recortan a "ahora"
}

function firstImage(html: string, base: string): string {
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m ? absolute(decodeEntities(m[1]), base) : "";
}

function mediaImage(item: Node, base: string): string {
  for (const key of ["media:thumbnail", "media:content", "enclosure"]) {
    for (const m of asArray<Node>(item[key])) {
      const url = m?.["@_url"];
      const type: string = m?.["@_type"] ?? m?.["@_medium"] ?? "";
      if (url && (key === "media:thumbnail" || !type || /image/i.test(type) || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url))) {
        return absolute(String(url), base);
      }
    }
  }
  return "";
}

function atomLink(links: Node, base: string): string {
  const all = asArray<Node>(links);
  const alt = all.find((l) => typeof l === "object" && (!l["@_rel"] || l["@_rel"] === "alternate")) ?? all[0];
  if (!alt) return "";
  return absolute(typeof alt === "string" ? alt : alt["@_href"] ?? "", base);
}

function buildEntry(item: Node, base: string, now: number, atom: boolean): ParsedEntry | null {
  const link = atom ? atomLink(item.link, base) : absolute(text(item.link), base);
  const body = text(item["content:encoded"]) || text(item.content) || text(item.description) || text(item.summary);
  const title = stripHtml(text(item.title), 300) || link;
  const guid = text(item.guid) || text(item.id) || link || title;
  if (!guid || (!link && !title)) return null;

  const date =
    text(item.pubDate) || text(item.published) || text(item.updated) || text(item["dc:date"]) || text(item.date);

  return {
    guid,
    title,
    link,
    summary: stripHtml(text(item.description) || text(item.summary) || body),
    image: mediaImage(item, base) || firstImage(body, base),
    publishedAt: parseDate(date, now),
  };
}

/** Devuelve null si el XML no es RSS, Atom o RDF. */
export function parseFeed(xml: string, baseUrl: string, now = Date.now()): ParsedFeed | null {
  let doc: Node;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }

  let title = "";
  let siteUrl = "";
  let items: Node[] = [];
  let atom = false;

  if (doc.rss?.channel) {
    const ch = asArray<Node>(doc.rss.channel)[0];
    title = text(ch.title);
    siteUrl = absolute(text(ch.link), baseUrl);
    items = asArray(ch.item);
  } else if (doc.feed) {
    atom = true;
    title = text(doc.feed.title);
    siteUrl = atomLink(doc.feed.link, baseUrl);
    items = asArray(doc.feed.entry);
  } else if (doc["rdf:RDF"]) {
    const rdf = doc["rdf:RDF"];
    title = text(rdf.channel?.title);
    siteUrl = absolute(text(rdf.channel?.link), baseUrl);
    items = asArray(rdf.item);
  } else {
    return null;
  }

  const entries = items
    .slice(0, 100)
    .map((i) => buildEntry(i, baseUrl, now, atom))
    .filter((e): e is ParsedEntry => e !== null);

  return { title: stripHtml(title, 200), siteUrl, entries };
}

/** Busca <link rel="alternate" type="application/rss+xml"> en una página HTML. */
export function findFeedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    const url = href && absolute(decodeEntities(href), baseUrl);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}
