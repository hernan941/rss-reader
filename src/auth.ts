import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export interface User {
  id: number;
  email: string;
}

const COOKIE = "sid";
const SESSION_MS = 30 * 24 * 3600_000;
// Máximo que permite Workers para PBKDF2. Se guarda en cada hash, así puede subirse después.
export const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const got = new Uint8Array(await derive(password, unb64(salt), Number(iter)));
  return sameBytes(got, unb64(hash));
}

/** Hash de relleno para gastar el mismo tiempo cuando el correo no existe. */
export const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export async function startSession(c: Context, db: D1Database, userId: number) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (m) => ({ "+": "-", "/": "_", "=": "" })[m]!);
  await db
    .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(await sha256(token), userId, Date.now() + SESSION_MS)
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

const TOUCH_MS = 5 * 60_000;

export async function currentUser(c: Context, db: D1Database): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
    )
    .bind(await sha256(token), now)
    .first<User & { last_seen_at: number }>();
  if (!row) return null;
  // Registrar actividad solo de vez en cuando, para no gastar escrituras.
  if (now - row.last_seen_at > TOUCH_MS) {
    await db.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`).bind(now, row.id).run();
  }
  return { id: row.id, email: row.email };
}

export async function endSession(c: Context, db: D1Database) {
  const token = getCookie(c, COOKIE);
  if (token) await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function purgeExpired(db: D1Database) {
  const now = Date.now();
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now),
    db.prepare(`DELETE FROM throttle WHERE window_start < ?`).bind(now - 24 * 3600_000),
  ]);
}

// ---------- Limitador de intentos ----------

export async function isBlocked(db: D1Database, key: string, max: number, windowMs: number): Promise<boolean> {
  const row = await db
    .prepare(`SELECT count, window_start FROM throttle WHERE key = ?`)
    .bind(key)
    .first<{ count: number; window_start: number }>();
  return !!row && Date.now() - row.window_start < windowMs && row.count >= max;
}

export async function recordHit(db: D1Database, key: string, windowMs: number) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO throttle (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start > ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start > ?3 THEN ?2 ELSE window_start END`,
    )
    .bind(key, now, windowMs)
    .run();
}

export const clearHits = (db: D1Database, key: string) =>
  db.prepare(`DELETE FROM throttle WHERE key = ?`).bind(key).run();

export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
