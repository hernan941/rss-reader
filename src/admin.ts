export interface Settings {
  registrationOpen: boolean;
  maxUsers: number; // 0 = sin límite
}

export type RegistrationState =
  | { open: true; users: number; max: number }
  | { open: false; reason: "manual" | "limit"; users: number; max: number };

export const isAdmin = (email: string, env: { ADMIN_EMAILS?: string }): boolean =>
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
  const m = new Map(results.map((r) => [r.key, r.value]));
  return { registrationOpen: m.get("registration_open") !== "0", maxUsers: Number(m.get("max_users")) || 0 };
}

async function setSetting(db: D1Database, key: string, value: string) {
  await db
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, value)
    .run();
}

export const setRegistrationOpen = (db: D1Database, open: boolean) => setSetting(db, "registration_open", open ? "1" : "0");
export const setMaxUsers = (db: D1Database, n: number) =>
  setSetting(db, "max_users", String(Math.max(0, Math.min(100_000, Math.floor(n) || 0))));

export async function countUsers(db: D1Database): Promise<number> {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>())?.n ?? 0;
}

export async function registrationState(db: D1Database): Promise<RegistrationState> {
  const [s, users] = await Promise.all([getSettings(db), countUsers(db)]);
  if (!s.registrationOpen) return { open: false, reason: "manual", users, max: s.maxUsers };
  if (s.maxUsers > 0 && users >= s.maxUsers) return { open: false, reason: "limit", users, max: s.maxUsers };
  return { open: true, users, max: s.maxUsers };
}

export interface AdminUser {
  id: number;
  email: string;
  created_at: number;
  last_seen_at: number;
  disabled: number;
  sessions: number;
  feeds: number;
}

export async function listUsers(db: D1Database): Promise<AdminUser[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.email, u.created_at, u.last_seen_at, u.disabled,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?1) AS sessions,
              (SELECT COUNT(*) FROM subscriptions b WHERE b.user_id = u.id) AS feeds
         FROM users u ORDER BY u.last_seen_at DESC, u.created_at DESC`,
    )
    .bind(Date.now())
    .all<AdminUser>();
  return results;
}

export async function siteStats(db: D1Database) {
  const row = await db
    .prepare(`SELECT (SELECT COUNT(*) FROM feeds) AS feeds, (SELECT COUNT(*) FROM entries) AS entries`)
    .first<{ feeds: number; entries: number }>();
  return row ?? { feeds: 0, entries: 0 };
}

export const kickUser = (db: D1Database, id: number) => db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id).run();

export async function setDisabled(db: D1Database, id: number, disabled: boolean) {
  await db.batch([
    db.prepare(`UPDATE users SET disabled = ? WHERE id = ?`).bind(disabled ? 1 : 0, id),
    ...(disabled ? [db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id)] : []),
  ]);
}

/** Borra la cuenta y, por cascada, sus sesiones, suscripciones y estados. */
export const deleteUser = (db: D1Database, id: number) => db.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();

export const getUserEmail = async (db: D1Database, id: number) =>
  (await db.prepare(`SELECT email FROM users WHERE id = ?`).bind(id).first<{ email: string }>())?.email ?? null;
