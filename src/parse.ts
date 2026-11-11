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

/** Lo que se muestra en el panel de vista previa, para decidir si leer el artículo completo. */
export const SUMMARY_MAX = 1500;

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

const BLOCK = "p|div|li|ul|ol|h[1-6]|blockquote|pre|tr|figure|figcaption|section|article|header|footer|hr";

/**
 * HTML a texto plano conservando párrafos. Regla: <br> y las etiquetas de bloque (apertura o cierre)
 * se vuelven saltos de línea; <li> lleva prefijo "• ". Tras recortar cada línea, toda secuencia de
 * saltos se convierte en "\n\n" (línea en blanco entre párrafos), salvo entre dos elementos de lista
 * consecutivos, que se separan con un solo "\n".
 */
export function htmlToText(html: string, max = SUMMARY_MAX): string {
  const raw = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, "gi"), "\n")
      .replace(/<[^>]+>/g, ""),
  );
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r\u00a0]+/g, " ").trim())
    .filter((l) => l !== "");
  let plain = "";
  lines.forEach((l, i) => {
    if (i > 0) plain += l.startsWith("• ") && lines[i - 1].startsWith("• ") ? "\n" : "\n\n";
    plain += l;
  });
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
  const tag = /<img\b[^>]*>/i.exec(html)?.[0];
  const src = tag ? attr(tag, "src") : "";
  return src ? absolute(decodeEntities(src), base) : "";
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

/** URL del icono que declara una página, o "" si no declara ninguno. */
export function findFavicon(html: string, baseUrl: string): string {
  let touch = "";
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href) continue;
    const url = absolute(decodeEntities(href), baseUrl);
    if (!url) continue;
    if (rel.split(/\s+/).includes("icon")) return url;
    if (rel.startsWith("apple-touch-icon") && !touch) touch = url;
  }
  return touch;
}

function buildEntry(item: Node, base: string, now: number, atom: boolean): ParsedEntry | null {
  const link = atom ? atomLink(item.link, base) : absolute(text(item.link), base);
  const body = text(item["content:encoded"]) || text(item.content) || text(item.description) || text(item.summary);
  const description = text(item.description) || text(item.summary);
  const title = stripHtml(text(item.title), 300) || link;
  const guid = text(item.guid) || text(item.id) || link || title;
  if (!guid || (!link && !title)) return null;

  const date =
    text(item.pubDate) || text(item.published) || text(item.updated) || text(item["dc:date"]) || text(item.date);

  let summary = htmlToText(body.length >= description.length ? body : description, SUMMARY_MAX);
  if (!summary) {
    // xkcd y similares: el texto del cómic va en el title (o alt) de la imagen
    const tag = /<img\b[^>]*>/i.exec(body)?.[0];
    if (tag) summary = decodeEntities(attr(tag, "title") || attr(tag, "alt")).trim();
  }

  return {
    guid,
    title,
    link,
    summary,
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
/** Valor de un atributo HTML, con o sin comillas (el HTML minificado suele omitirlas). */
function attr(tag: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? "";
}

export function findFeedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (attr(tag, "rel").toLowerCase() !== "alternate") continue;
    if (!/^application\/(rss|atom)\+xml/i.test(attr(tag, "type"))) continue;
    const href = attr(tag, "href");
    const url = href && absolute(decodeEntities(href), baseUrl);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}
