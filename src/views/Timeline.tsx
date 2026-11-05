import type { FC } from "hono/jsx";
import type { Entry, Sub, View } from "../db";
import { Icon, MenuBtn } from "./Layout";
import { relTime } from "./time";

/** Algunos feeds (p. ej. Hacker News) solo traen enlaces como resumen: es ruido, se oculta. */
const usefulSummary = (s: string) => (s && !/^Article URL:/i.test(s) ? s : "");

export const EntryItem: FC<{ e: Entry; now: number }> = ({ e, now }) => (
  <article class={`entry${e.is_read ? " read" : ""}${e.is_starred ? " starred" : ""}`} data-id={e.id} data-feed={e.feed_id}>
    <button type="button" class="act star" data-act="star" aria-label="Guardar" title="Guardar (s)"><Icon name="star" /></button>
    <span class="source">{e.feed_title}</span>
    <a class="entry-main" href={e.link} target="_blank" rel="noopener noreferrer">
      <span class="title">{e.title}</span>
      {usefulSummary(e.summary) ? <span class="sum"> — {usefulSummary(e.summary)}</span> : null}
    </a>
    <time class="when" datetime={new Date(e.sort_at).toISOString()}>{relTime(e.sort_at, now)}</time>
    <button type="button" class="act check" data-act="read" aria-label="Marcar como leído" title="Leído / no leído (m)"><Icon name="check" /></button>
  </article>
);

export const EntryList: FC<{ entries: Entry[]; next: string | null; moreHref: string }> = ({ entries, next, moreHref }) => {
  const now = Date.now();
  return (
    <>
      {entries.map((e) => <EntryItem e={e} now={now} />)}
      {next ? (
        <button type="button" class="more" data-href={`${moreHref}${moreHref.includes("?") ? "&" : "?"}before=${next}`}>
          Cargar más
        </button>
      ) : null}
    </>
  );
};

const WINDOWS: Record<View, string> = { unread: "sin-leer", all: "todo", starred: "guardados" };

interface Props {
  /** Parte local del correo: se muestra en el prompt, como `usuario@reader`. */
  username: string;
  view: View;
  feed: Sub | null;
  folder?: string;
  hasFeeds: boolean;
  entries: Entry[];
  next: string | null;
  base: string; // "/", "/feed/3" o "/folder/Tech"
}

export const Timeline: FC<Props> = ({ username, view, feed, folder, hasFeeds, entries, next, base }) => {
  const here = `${base}?v=${view}`;
  const dir = feed?.name ?? folder ?? WINDOWS[view];
  const ps1 = (
    <>
      <span class="ps1">{username}@reader</span>:
    </>
  );
  const win = (v: View, n: number) => (
    <a href={v === "starred" ? "/?v=starred" : `${base}?v=${v}`} class={view === v ? "win-active" : ""} aria-current={view === v ? "page" : undefined}>
      {n}:{WINDOWS[v]}{view === v ? "*" : ""}
    </a>
  );
  const hidden = (
    <>
      <input type="hidden" name="back" value={here} />
      {feed ? <input type="hidden" name="feed" value={String(feed.id)} /> : null}
      {folder !== undefined ? <input type="hidden" name="folder" value={folder} /> : null}
    </>
  );

  return (
    <>
      <div class="term">
      <div class="term-bar"><span></span><span></span><span></span><em>{username}@reader: ~/{dir}</em></div>
      <div class="term-body">
      <div class="page-head">
        <div class="titles">
          {ps1}<h1>~/{dir}</h1><span class="pre">$ ls -lt</span>
          {feed ? (
            <a class="sub" href={feed.site_url || feed.url} target="_blank" rel="noopener noreferrer">
              {new URL(feed.site_url || feed.url).hostname}
            </a>
          ) : null}
        </div>
        <div class="tools">
          <form method="post" action="/refresh" data-busy="Actualizando…">
            <input type="hidden" name="back" value={here} />
            <button class="ghost" type="submit" title="Buscar novedades ahora"><Icon name="refresh" /> <span>Actualizar</span></button>
          </form>
          {view !== "starred" ? (
            <form method="post" action="/read-all">
              {hidden}
              <button class="ghost" type="submit" title="Marcar todo como leído"><Icon name="check" /> <span>Marcar todo leído</span></button>
            </form>
          ) : null}
          {feed ? <MenuBtn head kind="feed" id={feed.id} name={feed.name} folder={feed.folder} /> : null}
          {folder !== undefined ? <MenuBtn head kind="folder" name={folder} /> : null}
        </div>
      </div>

      {feed?.last_error ? <div class="flash err">Última actualización fallida: {feed.last_error}</div> : null}

      <section class="list" id="list">
        {entries.length ? <EntryList entries={entries} next={next} moreHref={here} /> : <Empty view={view} hasFeeds={hasFeeds} base={base} />}
      </section>
      <p class="prompt-end">{ps1}<span class="cwd">~/{dir}</span>$ <span class="cursor">_</span></p>
      </div>
      <nav class="tmux app-tmux" aria-label="Vistas">
        <span>[reader] {win("unread", 0)} {win("all", 1)} {win("starred", 2)}</span>
        <span class="tmux-right">"lector rss"</span>
      </nav>
      </div>
    </>
  );
};

const Empty: FC<{ view: View; hasFeeds: boolean; base: string }> = ({ view, hasFeeds, base }) => {
  if (!hasFeeds) {
    return (
      <div class="empty">
        <h2>Agrega tu primera fuente</h2>
        <p>Pega la dirección de un blog o sitio en el cuadro de la izquierda y buscaré el feed por ti. También puedes importar un archivo OPML desde Feedly.</p>
      </div>
    );
  }
  if (view === "unread") {
    return (
      <div class="empty">
        <h2>Todo al día</h2>
        <p>No tienes artículos sin leer. <a href={`${base}?v=all`}>Ver todo</a></p>
      </div>
    );
  }
  if (view === "starred") {
    return (
      <div class="empty">
        <h2>Nada guardado</h2>
        <p>Toca la estrella de un artículo para guardarlo aquí.</p>
      </div>
    );
  }
  return (
    <div class="empty">
      <h2>Aún no hay artículos</h2>
      <p>Pulsa “Actualizar” para buscar novedades.</p>
    </div>
  );
};
