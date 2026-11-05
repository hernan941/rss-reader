import { findFeedLinks, parseFeed, type ParsedFeed } from "./parse";

const MAX_BYTES = 5 * 1024 * 1024;
const COMMON_PATHS = ["/feed", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml", "/rss"];

export type FetchResult =
  | { status: "not-modified" }
  | { status: "ok"; body: string; etag: string; lastModified: string; finalUrl: string };

/** Lee el cuerpo cortando en el límite: `Content-Length` puede faltar o mentir. */
async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out + decoder.decode();
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Respuesta demasiado grande");
    }
    out += decoder.decode(value, { stream: true });
  }
}

export async function fetchText(
  url: string,
  cond: { etag?: string; lastModified?: string } = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    "User-Agent": "rss-dashboard/1.0",
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
  };
  if (cond.etag) headers["If-None-Match"] = cond.etag;
  if (cond.lastModified) headers["If-Modified-Since"] = cond.lastModified;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000), redirect: "follow" });
  if (res.status === 304) return { status: "not-modified" };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Respuesta demasiado grande");

  return {
    status: "ok",
    body: await readLimited(res),
    etag: res.headers.get("etag") ?? "",
    lastModified: res.headers.get("last-modified") ?? "",
    finalUrl: res.url || url,
  };
}

export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export interface Discovered {
  feedUrl: string;
  parsed: ParsedFeed;
  etag: string;
  lastModified: string;
}

async function tryFeed(url: string): Promise<Discovered | null> {
  try {
    const r = await fetchText(url);
    if (r.status !== "ok") return null;
    if (/^\s*(<!doctype html|<html)/i.test(r.body)) return null;
    const parsed = parseFeed(r.body, r.finalUrl);
    return parsed ? { feedUrl: r.finalUrl, parsed, etag: r.etag, lastModified: r.lastModified } : null;
  } catch {
    return null;
  }
}

/** Acepta la URL de un feed o la de un sitio web y encuentra el feed. */
export async function discoverFeed(input: string): Promise<Discovered> {
  const url = normalizeUrl(input);
  if (!url) throw new Error("La dirección no es válida");

  let first;
  try {
    first = await fetchText(url);
  } catch (e) {
    throw new Error(`No se pudo abrir la página (${(e as Error).message})`);
  }
  if (first.status !== "ok") throw new Error("No se pudo abrir la página");

  const isHtml = /^\s*(<!doctype html|<html)/i.test(first.body);
  if (!isHtml) {
    const parsed = parseFeed(first.body, first.finalUrl);
    if (parsed) return { feedUrl: first.finalUrl, parsed, etag: first.etag, lastModified: first.lastModified };
  }

  const candidates = findFeedLinks(first.body, first.finalUrl);
  const origin = new URL(first.finalUrl).origin;
  for (const p of COMMON_PATHS) candidates.push(origin + p);

  for (const c of candidates) {
    const found = await tryFeed(c);
    if (found) return found;
  }
  throw new Error("No encontré un feed RSS en esa dirección");
}
