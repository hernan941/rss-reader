import type { Discovered } from "./fetch";
import type { ParsedEntry } from "./parse";

export type View = "all" | "starred";

/** Una suscripción tal como la ve el usuario en la barra lateral. */
export interface Sub {
  id: number; // id del feed
  name: string;
  url: string;
  site_url: string;
  favicon_url: string;
  last_error: string;
  folder: string;
  unread: number;
}

export interface Entry {
  id: number;
  feed_id: number;
  feed_title: string;
  title: string;
  link: string;
  summary: string;
  image: string;
  sort_at: number;
  is_read: number;
  is_starred: number;
}

export const PAGE_SIZE = 40;
export const MAX_FEEDS_PER_USER = 300;
/** Lo más viejo que esto cuenta como leído; mantiene baratas las consultas de "sin leer". */
export const UNREAD_DAYS = 14;

const horizon = () => Math.floor(Date.now() - UNREAD_DAYS * 86_400_000);
/** Estado de lectura efectivo: lo marcado por el usuario, o "leído" si es muy antiguo. */
const READ = (h: number) => `COALESCE(st.is_read, CASE WHEN e.sort_at <= ${h} THEN 1 ELSE 0 END)`;

export const cleanFolder = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

// ---------- Carpetas ----------

const MAX_FOLDERS_PER_USER = 100;

const addFolder = (db: D1Database, userId: number, name: string, now = Date.now()) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO folders (user_id, name, created_at)
       SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM folders WHERE user_id = ?1) < ${MAX_FOLDERS_PER_USER}`,
    )
    .bind(userId, name, now);

export async function listFolders(db: D1Database, userId: number): Promise<string[]> {
  const { results } = await db.prepare(`SELECT name FROM folders WHERE user_id = ?`).bind(userId).all<{ name: string }>();
  return results.map((r) => r.name);
}

/** Crea la carpeta si no existe. Devuelve false si se alcanzó el máximo. */
export async function createFolder(db: D1Database, userId: number, name: string): Promise<boolean> {
  await addFolder(db, userId, name).run();
  return !!(await db.prepare(`SELECT 1 FROM folders WHERE user_id = ? AND name = ?`).bind(userId, name).first());
}

/** Elimina la carpeta; sus fuentes se conservan, sin carpeta. */
export async function deleteFolder(db: D1Database, userId: number, name: string) {
  await db.batch([
    db.prepare(`UPDATE subscriptions SET folder = '' WHERE user_id = ? AND folder = ?`).bind(userId, name),
    db.prepare(`DELETE FROM folders WHERE user_id = ? AND name = ?`).bind(userId, name),
  ]);
}

// ---------- Suscripciones ----------

export async function listSubs(db: D1Database, userId: number): Promise<Sub[]> {
  const h = horizon();
  const { results } = await db
    .prepare(
      `SELECT f.id, COALESCE(NULLIF(s.title, ''), NULLIF(f.title, ''), f.url) AS name,
              f.url, f.site_url, f.favicon_url, f.last_error, s.folder,
              (SELECT COUNT(*) FROM entries e
                 LEFT JOIN entry_state st ON st.entry_id = e.id AND st.user_id = s.user_id
                WHERE e.feed_id = f.id AND e.sort_at > ${h} AND ${READ(h)} = 0) AS unread
         FROM subscriptions s JOIN feeds f ON f.id = s.feed_id
        WHERE s.user_id = ?
        ORDER BY lower(name)`,
    )
    .bind(userId)
    .all<Sub>();
  return results;
}

export async function countStarred(db: D1Database, userId: number): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM entry_state WHERE user_id = ? AND is_starred = 1`)
    .bind(userId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function countSubs(db: D1Database, userId: number): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ?`).bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Registra el feed (si es nuevo) y suscribe al usuario. */
export async function subscribe(
  db: D1Database,
  userId: number,
  d: Discovered,
  now = Date.now(),
): Promise<{ id: number; existed: boolean; isNewFeed: boolean }> {
  let feed = await db.prepare(`SELECT id FROM feeds WHERE url = ?`).bind(d.feedUrl).first<{ id: number }>();
  const isNewFeed = !feed;
  if (!feed) {
    const res = await db
      .prepare(
        `INSERT INTO feeds (url, title, site_url, etag, last_modified, last_checked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(d.feedUrl, d.parsed.title, d.parsed.siteUrl, d.etag, d.lastModified, now, now)
      .run();
    feed = { id: res.meta.last_row_id as number };
  }
  const res = await db
    .prepare(`INSERT OR IGNORE INTO subscriptions (user_id, feed_id, created_at) VALUES (?, ?, ?)`)
    .bind(userId, feed.id, now)
    .run();
  return { id: feed.id, existed: res.meta.changes === 0, isNewFeed };
}

export async function unsubscribe(db: D1Database, userId: number, feedId: number) {
  await db.prepare(`DELETE FROM subscriptions WHERE user_id = ? AND feed_id = ?`).bind(userId, feedId).run();
}

export async function renameSub(db: D1Database, userId: number, feedId: number, title: string) {
  await db
    .prepare(`UPDATE subscriptions SET title = ? WHERE user_id = ? AND feed_id = ?`)
    .bind(title.trim().slice(0, 120), userId, feedId)
    .run();
}

export async function moveSub(db: D1Database, userId: number, feedId: number, folder: string) {
  const name = cleanFolder(folder);
  await db.batch([
    ...(name ? [addFolder(db, userId, name)] : []),
    db.prepare(`UPDATE subscriptions SET folder = ? WHERE user_id = ? AND feed_id = ?`).bind(name, userId, feedId),
  ]);
}

export async function renameFolder(db: D1Database, userId: number, from: string, to: string) {
  const name = cleanFolder(to);
  if (!name || name === from) return;
  await db.batch([
    db.prepare(`DELETE FROM folders WHERE user_id = ? AND name = ?`).bind(userId, from),
    addFolder(db, userId, name),
    db.prepare(`UPDATE subscriptions SET folder = ? WHERE user_id = ? AND folder = ?`).bind(name, userId, from),
  ]);
}

/** Importa feeds de un OPML ya parseado. Devuelve cuántos se suscribieron. */
export async function importFeeds(
  db: D1Database,
  userId: number,
  feeds: { url: string; title: string; folder: string }[],
  now = Date.now(),
): Promise<number> {
  const room = MAX_FEEDS_PER_USER - (await countSubs(db, userId));
  const list = feeds.slice(0, Math.max(0, room));
  const names = [...new Set(list.map((f) => cleanFolder(f.folder)).filter(Boolean))];
  if (names.length) await db.batch(names.map((n) => addFolder(db, userId, n, now)));
  const addFeed = db.prepare(`INSERT OR IGNORE INTO feeds (url, title, created_at, last_checked_at) VALUES (?, ?, ?, 0)`);
  const addSub = db.prepare(
    `INSERT OR IGNORE INTO subscriptions (user_id, feed_id, title, folder, created_at)
     SELECT ?, id, '', ?, ? FROM feeds WHERE url = ?`,
  );
  for (let i = 0; i < list.length; i += 25) {
    await db.batch(
      list.slice(i, i + 25).flatMap((f) => [
        addFeed.bind(f.url, f.title, now),
        addSub.bind(userId, cleanFolder(f.folder), now, f.url),
      ]),
    );
  }
  return list.length;
}

// ---------- Artículos ----------

export async function saveEntries(db: D1Database, feedId: number, entries: ParsedEntry[], now = Date.now()) {
  if (!entries.length) return;
  const stmt = db.prepare(
    `INSERT INTO entries (feed_id, guid, title, link, summary, image, sort_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(feed_id, guid) DO UPDATE SET summary = excluded.summary, image = excluded.image
     WHERE entries.summary IS NOT excluded.summary OR entries.image IS NOT excluded.image`,
  );
  await db.batch(
    entries.map((e) => stmt.bind(feedId, e.guid, e.title, e.link, e.summary, e.image, e.publishedAt ?? now)),
  );
}

export interface Query {
  view: View;
  feedId?: number;
  folder?: string;
  before?: string; // "sort_at:id"
}

export async function queryEntries(
  db: D1Database,
  userId: number,
  q: Query,
): Promise<{ entries: Entry[]; next: string | null }> {
  const h = horizon();
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (q.view === "starred") where.push("st.is_starred = 1");
  else where.push("s.user_id IS NOT NULL");
  if (q.feedId) {
    where.push("e.feed_id = ?");
    args.push(q.feedId);
  }
  if (q.folder !== undefined) {
    where.push("s.folder = ?");
    args.push(q.folder);
  }
  const m = q.before && /^(\d+):(\d+)$/.exec(q.before);
  if (m) {
    where.push("(e.sort_at < ? OR (e.sort_at = ? AND e.id < ?))");
    args.push(Number(m[1]), Number(m[1]), Number(m[2]));
  }

  const { results } = await db
    .prepare(
      `SELECT e.id, e.feed_id, COALESCE(NULLIF(s.title, ''), NULLIF(f.title, ''), f.url) AS feed_title,
              e.title, e.link, e.summary, e.image, e.sort_at,
              ${READ(h)} AS is_read, COALESCE(st.is_starred, 0) AS is_starred
         FROM entries e
         JOIN feeds f ON f.id = e.feed_id
         LEFT JOIN subscriptions s ON s.feed_id = e.feed_id AND s.user_id = ?
         LEFT JOIN entry_state st ON st.entry_id = e.id AND st.user_id = ?
        WHERE ${where.join(" AND ")}
        ORDER BY e.sort_at DESC, e.id DESC
        LIMIT ?`,
    )
    .bind(userId, userId, ...args, PAGE_SIZE + 1)
    .all<Entry>();

  const more = results.length > PAGE_SIZE;
  const entries = more ? results.slice(0, PAGE_SIZE) : results;
  const last = entries[entries.length - 1];
  return { entries, next: more && last ? `${last.sort_at}:${last.id}` : null };
}

export async function setFlag(
  db: D1Database,
  userId: number,
  entryId: number,
  col: "is_read" | "is_starred",
  value: boolean,
) {
  const v = value ? 1 : 0;
  const h = horizon();
  // Si la fila no existe se crea (solo si el artículo existe); lo antiguo nace como "leído".
  const sql =
    col === "is_read"
      ? `INSERT INTO entry_state (user_id, entry_id, is_read, is_starred) SELECT ?1, id, ?3, 0 FROM entries WHERE id = ?2
         ON CONFLICT(user_id, entry_id) DO UPDATE SET is_read = excluded.is_read`
      : `INSERT INTO entry_state (user_id, entry_id, is_read, is_starred)
         SELECT ?1, id, CASE WHEN sort_at <= ${h} THEN 1 ELSE 0 END, ?3 FROM entries WHERE id = ?2
         ON CONFLICT(user_id, entry_id) DO UPDATE SET is_starred = excluded.is_starred`;
  await db.prepare(sql).bind(userId, entryId, v).run();
}

export async function markAllRead(db: D1Database, userId: number, scope: { feedId?: number; folder?: string } = {}) {
  const h = horizon();
  const extra: string[] = [];
  const args: (string | number)[] = [userId, userId, userId];
  if (scope.feedId) {
    extra.push("AND e.feed_id = ?");
    args.push(scope.feedId);
  }
  if (scope.folder !== undefined) {
    extra.push("AND s.folder = ?");
    args.push(scope.folder);
  }
  await db
    .prepare(
      `INSERT INTO entry_state (user_id, entry_id, is_read)
       SELECT ?, e.id, 1
         FROM entries e
         JOIN subscriptions s ON s.feed_id = e.feed_id AND s.user_id = ?
         LEFT JOIN entry_state st ON st.entry_id = e.id AND st.user_id = ?
        WHERE e.sort_at > ${h} AND ${READ(h)} = 0 ${extra.join(" ")}
       ON CONFLICT(user_id, entry_id) DO UPDATE SET is_read = 1`,
    )
    .bind(...args)
    .run();
}

// ---------- Cuentas ----------

export async function findUserByEmail(db: D1Database, email: string) {
  return db
    .prepare(`SELECT id, email, password_hash, disabled FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: number; email: string; password_hash: string; disabled: number }>();
}

/** `maxUsers` > 0 evita superar el límite aunque dos registros lleguen a la vez. */
export async function createUser(db: D1Database, email: string, passwordHash: string, maxUsers = 0): Promise<number | null> {
  const now = Date.now();
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO users (email, password_hash, created_at, last_seen_at)
       SELECT ?1, ?2, ?3, ?3 WHERE ?4 = 0 OR (SELECT COUNT(*) FROM users) < ?4`,
    )
    .bind(email, passwordHash, now, maxUsers)
    .run();
  return res.meta.changes ? (res.meta.last_row_id as number) : null;
}
