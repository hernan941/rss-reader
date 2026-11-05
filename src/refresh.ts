import { saveEntries } from "./db";
import { fetchText, resolveFavicon } from "./fetch";
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

export async function refreshFeed(db: D1Database, feed: DueFeed, now = Date.now()): Promise<void> {
  try {
    const r = await fetchText(feed.url, { etag: feed.etag, lastModified: feed.last_modified });
    if (r.status === "not-modified") {
      await db.prepare(`UPDATE feeds SET last_checked_at = ?, last_error = '' WHERE id = ?`).bind(now, feed.id).run();
      return;
    }
    const parsed = parseFeed(r.body, r.finalUrl, now);
    if (!parsed) throw new Error("El contenido no es un feed válido");

    await saveEntries(db, feed.id, parsed.entries, now);
    await db
      .prepare(
        `UPDATE feeds SET etag = ?, last_modified = ?, last_checked_at = ?, last_error = '',
                title = CASE WHEN title = '' THEN ? ELSE title END,
                site_url = CASE WHEN site_url = '' THEN ? ELSE site_url END
          WHERE id = ?`,
      )
      .bind(r.etag, r.lastModified, now, parsed.title, parsed.siteUrl, feed.id)
      .run();
  } catch (e) {
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
          AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = f.id ${userId ? "AND s.user_id = ?" : ""})
        ORDER BY f.last_checked_at ASC LIMIT ?`,
    )
    .bind(...[now - minAgeMs, ...(userId ? [userId] : []), MAX_PER_RUN])
    .all<DueFeed>();

  const queue = [...results];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) await refreshFeed(db, f, now);
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await backfillFavicons(db, Math.min(MAX_FAVICONS, REQUEST_BUDGET - results.length), userId);
  return results.length;
}
