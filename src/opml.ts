import { XMLParser } from "fast-xml-parser";
import type { Sub } from "./db";
import { normalizeUrl } from "./fetch";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export interface OpmlFeed {
  url: string;
  title: string;
  folder: string;
}

/** Los outline sin xmlUrl se tratan como carpetas (solo un nivel, como en Feedly). */
export function parseOpml(xml: string): OpmlFeed[] {
  const out: OpmlFeed[] = [];
  const walk = (node: any, folder: string) => {
    for (const o of Array.isArray(node) ? node : node ? [node] : []) {
      const label = String(o["@_title"] ?? o["@_text"] ?? "");
      const url = o["@_xmlUrl"] ? normalizeUrl(String(o["@_xmlUrl"])) : null;
      if (url) out.push({ url, title: label, folder });
      if (o.outline) walk(o.outline, url ? folder : folder || label);
    }
  };
  try {
    walk(parser.parse(xml)?.opml?.body?.outline, "");
  } catch {
    return [];
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildOpml(subs: Sub[]): string {
  const line = (f: Sub, indent: string) =>
    `${indent}<outline type="rss" text="${esc(f.name)}" title="${esc(f.name)}" xmlUrl="${esc(f.url)}" htmlUrl="${esc(f.site_url)}"/>`;

  const folders = new Map<string, Sub[]>();
  for (const f of subs) if (f.folder) folders.set(f.folder, [...(folders.get(f.folder) ?? []), f]);

  const rows = [
    ...[...folders].map(
      ([name, list]) =>
        `    <outline text="${esc(name)}" title="${esc(name)}">\n${list.map((f) => line(f, "      ")).join("\n")}\n    </outline>`,
    ),
    ...subs.filter((f) => !f.folder).map((f) => line(f, "    ")),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Lector RSS</title></head>
  <body>
${rows}
  </body>
</opml>
`;
}
