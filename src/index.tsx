import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import {
  deleteUser, getUserEmail, isAdmin, kickUser, listUsers, registrationState, setDisabled, setMaxUsers,
  setRegistrationOpen, siteStats,
} from "./admin";
import {
  clearHits, currentUser, DUMMY_HASH, endSession, hashPassword, isBlocked, purgeExpired,
  recordHit, startSession, validEmail, verifyPassword, type User,
} from "./auth";
import {
  cleanFolder, countStarred, countSubs, createUser, findUserByEmail, importFeeds, listSubs, markAllRead,
  MAX_FEEDS_PER_USER, moveSub, queryEntries, renameFolder, renameSub, saveEntries, setFlag, subscribe, unsubscribe,
  type View,
} from "./db";
import { discoverFeed } from "./fetch";
import { buildOpml, parseOpml } from "./opml";
import { refreshDue } from "./refresh";
import { AdminPage } from "./views/Admin";
import { AuthPage } from "./views/Auth";
import { Layout } from "./views/Layout";
import { EntryList, Timeline } from "./views/Timeline";

type Env = { DB: D1Database; INVITE_CODE?: string; ADMIN_EMAILS?: string };
type App = { Bindings: Env; Variables: { user: User } };
const app = new Hono<App>();

const MIN = 60_000;
const parseView = (v: string | undefined): View => (v === "all" || v === "starred" ? v : "unread");
const ip = (c: any) => c.req.header("cf-connecting-ip") ?? "local";
const enc = encodeURIComponent;

/** Solo permite volver a rutas internas. */
const safeBack = (b: unknown): string => (typeof b === "string" && /^\/(?!\/)/.test(b) ? b : "/");

function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, "http://x");
  u.searchParams.set(key, value);
  return u.pathname + u.search;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const sameHost = (origin: string, requestUrl: string): boolean => {
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false; // p. ej. "Origin: null"
  }
};

app.use(
  "*",
  secureHeaders({
    // No usar "no-referrer": haría que los formularios envíen "Origin: null" y los rechace la defensa CSRF.
    referrerPolicy: "same-origin",
    strictTransportSecurity: "max-age=15552000",
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  }),
);

// Nunca aceptar contraseñas ni cookies por HTTP (salvo en desarrollo local).
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    url.protocol = "https:";
    return c.redirect(url.href, 308);
  }
  await next();
});

// Defensa extra contra CSRF (además de la cookie SameSite=Lax).
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if (origin && !sameHost(origin, c.req.url)) return c.text("Forbidden", 403);
  }
  await next();
});

// ---------- Acceso (público) ----------

const closedMessage = (r: Awaited<ReturnType<typeof registrationState>>) =>
  r.open ? undefined : r.reason === "limit" ? "Se alcanzó el número máximo de usuarios." : "El registro está cerrado por ahora.";

app.get("/login", async (c) => {
  if (await currentUser(c, c.env.DB)) return c.redirect("/");
  return c.html(<AuthPage mode="login" canRegister={(await registrationState(c.env.DB)).open} />);
});
app.get("/register", async (c) => {
  if (await currentUser(c, c.env.DB)) return c.redirect("/");
  const reg = await registrationState(c.env.DB);
  return c.html(<AuthPage mode="register" needInvite={!!c.env.INVITE_CODE} closed={closedMessage(reg)} />);
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const keys = [`login:${email}`, `ip:${ip(c)}`];
  const fail = async (msg: string, status: 200 | 429 = 200) =>
    c.html(<AuthPage mode="login" err={msg} email={email} canRegister={(await registrationState(c.env.DB)).open} />, status);

  if ((await isBlocked(c.env.DB, keys[0], 8, 15 * MIN)) || (await isBlocked(c.env.DB, keys[1], 40, 15 * MIN))) {
    return await fail("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 429);
  }
  const user = await findUserByEmail(c.env.DB, email);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    await Promise.all(keys.map((k) => recordHit(c.env.DB, k, 15 * MIN)));
    return await fail("Correo o contraseña incorrectos.");
  }
  if (user.disabled) return await fail("Tu cuenta está suspendida. Contacta con el administrador.");
  await clearHits(c.env.DB, keys[0]);
  await startSession(c, c.env.DB, user.id);
  return c.redirect("/");
});

app.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const needInvite = !!c.env.INVITE_CODE;
  const fail = (msg: string) => c.html(<AuthPage mode="register" err={msg} email={email} needInvite={needInvite} />);

  const reg = await registrationState(c.env.DB);
  if (!reg.open) return c.html(<AuthPage mode="register" needInvite={needInvite} closed={closedMessage(reg)} />, 403);

  // El límite va antes que el código de invitación, para que no se pueda adivinar a fuerza de intentos.
  const key = `reg:${ip(c)}`;
  if (await isBlocked(c.env.DB, key, 5, 60 * MIN)) return fail("Demasiados registros desde esta conexión. Inténtalo más tarde.");
  if (needInvite && String(body.invite ?? "") !== c.env.INVITE_CODE) {
    await recordHit(c.env.DB, key, 60 * MIN);
    return fail("El código de invitación no es válido.");
  }
  if (!validEmail(email)) return fail("Escribe un correo válido.");
  if (password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");
  if (password.length > 200) return fail("La contraseña es demasiado larga.");

  await recordHit(c.env.DB, key, 60 * MIN);

  const id = await createUser(c.env.DB, email, await hashPassword(password), reg.max);
  if (!id) {
    // Puede ser un correo repetido, o que el límite se alcanzara justo ahora.
    const now = await registrationState(c.env.DB);
    return now.open ? fail("Ya existe una cuenta con ese correo.") : c.html(<AuthPage mode="register" closed={closedMessage(now)} />, 403);
  }
  await startSession(c, c.env.DB, id);
  return c.redirect("/");
});

// ---------- Todo lo demás exige sesión ----------

app.use("*", async (c, next) => {
  const user = await currentUser(c, c.env.DB);
  if (!user) return c.req.method === "GET" ? c.redirect("/login") : c.text("No autorizado", 401);
  c.set("user", user);
  await next();
});

app.post("/logout", async (c) => {
  await endSession(c, c.env.DB);
  return c.redirect("/login");
});

// ---------- Páginas ----------

async function renderTimeline(c: any, scope: { feedId?: number; folder?: string } = {}) {
  const db: D1Database = c.env.DB;
  const user: User = c.get("user");
  const view = parseView(c.req.query("v"));
  const before = c.req.query("before");
  const base = scope.feedId ? `/feed/${scope.feedId}` : scope.folder !== undefined ? `/folder/${enc(scope.folder)}` : "/";
  const q = { view, before, ...scope };

  if (c.req.query("partial")) {
    const { entries, next } = await queryEntries(db, user.id, q);
    return c.html(<EntryList entries={entries} next={next} moreHref={`${base}?v=${view}`} />);
  }

  const [subs, starred, page] = await Promise.all([listSubs(db, user.id), countStarred(db, user.id), queryEntries(db, user.id, q)]);
  const feed = scope.feedId ? subs.find((s) => s.id === scope.feedId) ?? null : null;
  if ((scope.feedId && !feed) || (scope.folder !== undefined && !subs.some((s) => s.folder === scope.folder))) {
    return c.redirect("/");
  }

  const heading = feed ? feed.name : scope.folder !== undefined ? scope.folder : view === "unread" ? "Sin leer" : view === "starred" ? "Guardados" : "Todo";
  return c.html(
    <Layout user={user} admin={isAdmin(user.email, c.env)} subs={subs} starred={starred} view={view} feedId={scope.feedId} folder={scope.folder} title={heading} msg={c.req.query("msg")} err={c.req.query("err")}>
      <Timeline username={user.email.split("@")[0]} view={view} feed={feed} folder={scope.folder} hasFeeds={subs.length > 0} entries={page.entries} next={page.next} base={base} />
    </Layout>,
  );
}

app.get("/", (c) => renderTimeline(c));
app.get("/feed/:id{[0-9]+}", (c) => renderTimeline(c, { feedId: Number(c.req.param("id")) }));
app.get("/folder/:name{.+}", (c) => renderTimeline(c, { folder: c.req.param("name") }));

// ---------- Fuentes ----------

app.post("/feeds", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  try {
    if ((await countSubs(c.env.DB, user.id)) >= MAX_FEEDS_PER_USER) {
      throw new Error(`Llegaste al máximo de ${MAX_FEEDS_PER_USER} fuentes`);
    }
    const found = await discoverFeed(String(body.url ?? ""));
    const { id, existed, isNewFeed } = await subscribe(c.env.DB, user.id, found);
    if (existed) return c.redirect(`/feed/${id}?v=all&msg=${enc("Ya sigues esta fuente")}`);
    if (isNewFeed) await saveEntries(c.env.DB, id, found.parsed.entries);
    const name = found.parsed.title || new URL(found.feedUrl).hostname;
    return c.redirect(`/feed/${id}?v=all&msg=${enc(`Agregado: ${name}`)}`);
  } catch (e) {
    return c.redirect(withParam(safeBack(body.back), "err", (e as Error).message));
  }
});

app.post("/feeds/:id{[0-9]+}/unfollow", async (c) => {
  await unsubscribe(c.env.DB, c.get("user").id, Number(c.req.param("id")));
  return c.redirect(`/?msg=${enc("Dejaste de seguir la fuente")}`);
});

app.post("/feeds/:id{[0-9]+}/rename", async (c) => {
  const body = await c.req.parseBody();
  await renameSub(c.env.DB, c.get("user").id, Number(c.req.param("id")), String(body.name ?? ""));
  return c.redirect(safeBack(body.back));
});

app.post("/feeds/:id{[0-9]+}/folder", async (c) => {
  const body = await c.req.parseBody();
  await moveSub(c.env.DB, c.get("user").id, Number(c.req.param("id")), String(body.folder ?? ""));
  return c.redirect(safeBack(body.back));
});

app.post("/folders/rename", async (c) => {
  const body = await c.req.parseBody();
  const to = cleanFolder(body.to);
  await renameFolder(c.env.DB, c.get("user").id, String(body.from ?? ""), to);
  return c.redirect(to ? `/folder/${enc(to)}?v=unread` : "/");
});

// ---------- Artículos ----------

for (const [name, col] of [["read", "is_read"], ["star", "is_starred"]] as const) {
  app.post(`/entries/:id{[0-9]+}/${name}`, async (c) => {
    const { value } = await c.req.json<{ value: boolean }>().catch(() => ({ value: false }));
    await setFlag(c.env.DB, c.get("user").id, Number(c.req.param("id")), col, !!value);
    return c.body(null, 204);
  });
}

app.post("/read-all", async (c) => {
  const body = await c.req.parseBody();
  const feedId = Number(body.feed) || undefined;
  const folder = typeof body.folder === "string" ? body.folder : undefined;
  await markAllRead(c.env.DB, c.get("user").id, { feedId, folder });
  return c.redirect(safeBack(body.back));
});

app.post("/refresh", async (c) => {
  const body = await c.req.parseBody();
  await refreshDue(c.env.DB, MIN, c.get("user").id);
  return c.redirect(withParam(safeBack(body.back), "msg", "Fuentes actualizadas"));
});

// ---------- OPML ----------

app.post("/opml", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.redirect(`/?err=${enc("Elige un archivo OPML")}`);
  if (file.size > 2 * 1024 * 1024) return c.redirect(`/?err=${enc("El archivo es demasiado grande")}`);

  const feeds = parseOpml(await file.text());
  if (!feeds.length) return c.redirect(`/?err=${enc("No encontré fuentes en ese archivo")}`);

  const n = await importFeeds(c.env.DB, c.get("user").id, feeds);
  // Las primeras se descargan ya; el resto lo hace el cron en lotes.
  c.executionCtx.waitUntil(refreshDue(c.env.DB, 0, c.get("user").id));
  return c.redirect(`/?v=all&msg=${enc(`Importadas ${n} fuentes. Los artículos irán apareciendo en unos minutos.`)}`);
});

app.get("/opml", async (c) =>
  c.body(buildOpml(await listSubs(c.env.DB, c.get("user").id)), 200, { "Content-Type": "text/x-opml; charset=utf-8" }),
);

// ---------- Administración (solo cuentas listadas en ADMIN_EMAILS) ----------

const adminApp = new Hono<App>();
adminApp.use("*", async (c, next) => (isAdmin(c.get("user").email, c.env) ? next() : c.notFound()));

adminApp.get("/", async (c) => {
  const [users, reg, stats] = await Promise.all([listUsers(c.env.DB), registrationState(c.env.DB), siteStats(c.env.DB)]);
  const admins = (c.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return c.html(<AdminPage me={c.get("user")} users={users} admins={admins} reg={reg} stats={stats} msg={c.req.query("msg")} err={c.req.query("err")} />);
});

const back = (c: any, key: "msg" | "err", text: string) => c.redirect(`/admin?${key}=${enc(text)}`);

adminApp.post("/registration", async (c) => {
  const body = await c.req.parseBody();
  const open = body.open === "1";
  await setRegistrationOpen(c.env.DB, open);
  return back(c, "msg", open ? "Registro abierto" : "Registro cerrado");
});

adminApp.post("/max-users", async (c) => {
  const body = await c.req.parseBody();
  const max = Number(body.max);
  if (!Number.isFinite(max) || max < 0) return back(c, "err", "Escribe un número válido (0 = sin límite)");
  await setMaxUsers(c.env.DB, max);
  return back(c, "msg", max ? `Límite fijado en ${Math.floor(max)} usuarios` : "Sin límite de usuarios");
});

adminApp.post("/users/:id{[0-9]+}/:action{kick|suspend|enable|delete}", async (c) => {
  const id = Number(c.req.param("id"));
  const email = await getUserEmail(c.env.DB, id);
  if (!email) return back(c, "err", "Ese usuario no existe");
  if (id === c.get("user").id || isAdmin(email, c.env)) return back(c, "err", "No puedes hacer eso con un administrador");

  switch (c.req.param("action")) {
    case "kick": await kickUser(c.env.DB, id); return back(c, "msg", `Sesiones de ${email} cerradas`);
    case "suspend": await setDisabled(c.env.DB, id, true); return back(c, "msg", `${email} suspendido`);
    case "enable": await setDisabled(c.env.DB, id, false); return back(c, "msg", `${email} reactivado`);
    default: await deleteUser(c.env.DB, id); return back(c, "msg", `${email} eliminado`);
  }
});

app.route("/admin", adminApp);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([refreshDue(env.DB), purgeExpired(env.DB)]));
  },
} satisfies ExportedHandler<Env>;
