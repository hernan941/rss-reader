import { saveEntries } from "./db";
import { fetchText, RateLimitError, resolveFavicon } from "./fetch";
import { parseFeed } from "./parse";

// El plan gratis de Workers permite ~50 peticiones salientes por ejecución.
const MAX_PER_RUN = 40;
const CONCURRENCY = 8;
// Los favicons usan solo lo que sobra del presupuesto de peticiones.
const REQUEST_BUDGET = 45;
const MAX_FAVICONS = 20;

export interface DueFeed {
  id: number;
  url: string;
  etag: string;
  last_modified: string;
}

export function pickBatch(feeds: DueFeed[], maxPerHost: number): DueFeed[] {
  const counts = new Map<string, number>();
  const batch: DueFeed[] = [];
  for (const feed of feeds) {
    let host = "";
    try {
      host = new URL(feed.url).hostname.toLowerCase();
    } catch {
      host = feed.url;
    }
    const count = counts.get(host) ?? 0;
    if (count >= maxPerHost) continue;
    counts.set(host, count + 1);
    batch.push(feed);
  }
  return batch;
}

export async function refreshFeed(db: D1Database, feed: DueFeed, now = Date.now()): Promise<void> {
  try {
    const r = await fetchText(feed.url, { etag: feed.etag, lastModified: feed.last_modified });
    if (r.status === "not-modified") {
      await db.prepare(`UPDATE feeds SET last_checked_at = ?, last_error = '', retry_after = 0 WHERE id = ?`).bind(now, feed.id).run();
      return;
    }
    const parsed = parseFeed(r.body, r.finalUrl, now);
    if (!parsed) throw new Error("El contenido no es un feed válido");

    await saveEntries(db, feed.id, parsed.entries, now);
    await db
      .prepare(
        `UPDATE feeds SET etag = ?, last_modified = ?, last_checked_at = ?, last_error = '',
                retry_after = 0,
                title = CASE WHEN title = '' THEN ? ELSE title END,
                site_url = CASE WHEN site_url = '' THEN ? ELSE site_url END
          WHERE id = ?`,
      )
      .bind(r.etag, r.lastModified, now, parsed.title, parsed.siteUrl, feed.id)
      .run();
  } catch (e) {
    if (e instanceof RateLimitError) {
      const retryAfter = now + e.retryAfterMs;
      const minutes = Math.ceil(e.retryAfterMs / 60_000);
      await db
        .prepare(`UPDATE feeds SET last_checked_at = ?, last_error = ?, retry_after = ? WHERE id = ?`)
        .bind(now, `${e.message} (reintento en ${minutes} min)`, retryAfter, feed.id)
        .run();
      return;
    }
    await db
      .prepare(`UPDATE feeds SET last_checked_at = ?, last_error = ? WHERE id = ?`)
      .bind(now, (e as Error).message.slice(0, 200), feed.id)
      .run();
  }
}

/** Completa `favicon_url` de las fuentes que aún no lo tienen, las más nuevas primero. */
export async function backfillFavicons(db: D1Database, limit: number, userId?: number): Promise<void> {
  if (limit <= 0) return;
  const { results } = await db
    .prepare(
      `SELECT f.id, f.url, f.site_url FROM feeds f
        WHERE f.favicon_url = ''
          AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = f.id ${userId ? "AND s.user_id = ?" : ""})
        ORDER BY f.id DESC LIMIT ?`,
    )
    .bind(...[...(userId ? [userId] : []), limit])
    .all<{ id: number; url: string; site_url: string }>();

  await Promise.all(
    results.map(async (f) => {
      const url = await resolveFavicon(f.site_url || f.url);
      await db.prepare(`UPDATE feeds SET favicon_url = ? WHERE id = ?`).bind(url, f.id).run();
    }),
  );
}

/**
 * Refresca los feeds revisados hace más tiempo que `minAgeMs`, los más antiguos primero.
 * Solo se descargan feeds con al menos un suscriptor; con `userId` solo los de esa persona.
 */
export async function refreshDue(db: D1Database, minAgeMs = 10 * 60_000, userId?: number): Promise<number> {
  const now = Date.now();
  const { results } = await db
    .prepare(
      `SELECT f.id, f.url, f.etag, f.last_modified FROM feeds f
        WHERE f.last_checked_at < ?
          AND f.retry_after <= ?
          AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = f.id ${userId ? "AND s.user_id = ?" : ""})
        ORDER BY f.last_checked_at ASC LIMIT ?`,
    )
    .bind(...[now - minAgeMs, now, ...(userId ? [userId] : []), MAX_PER_RUN])
    .all<DueFeed>();

  const batch = pickBatch(results, 3);
  const hosts = new Map<string, DueFeed[]>();
  for (const feed of batch) {
    let host = "";
    try {
      host = new URL(feed.url).hostname.toLowerCase();
    } catch {
      host = feed.url;
    }
    const group = hosts.get(host) ?? [];
    group.push(feed);
    hosts.set(host, group);
  }
  const groups = [...hosts.values()];
  const worker = async (index: number) => {
    for (; index < groups.length; index += CONCURRENCY) {
      for (const feed of groups[index]) await refreshFeed(db, feed, now);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, (_, index) => worker(index)));
  await backfillFavicons(db, Math.min(MAX_FAVICONS, REQUEST_BUDGET - batch.length), userId);
  return batch.length;
}
