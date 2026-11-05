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

interface Props {
  view: View;
  heading: string;
  feed: Sub | null;
  folder?: string;
  hasFeeds: boolean;
  emptyFolder: boolean;
  entries: Entry[];
  next: string | null;
  base: string; // "/", "/feed/3" o "/folder/Tech"
}

export const Timeline: FC<Props> = ({ view, heading, feed, folder, hasFeeds, emptyFolder, entries, next, base }) => {
  const here = `${base}?v=${view}`;
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
      <div class="term-body">
      <div class="page-head">
        <div class="titles">
          <h1>{heading}</h1>
          {feed ? (
            <a class="sub" href={feed.site_url || feed.url} target="_blank" rel="noopener noreferrer">
              {new URL(feed.site_url || feed.url).hostname}
            </a>
          ) : null}
        </div>
        <div class="tools">
          {view !== "starred" ? (
            <div class="seg" role="tablist">
              <a href={`${base}?v=unread`} class={view === "unread" ? "active" : ""} role="tab" aria-selected={view === "unread"}>Sin leer</a>
              <a href={`${base}?v=all`} class={view === "all" ? "active" : ""} role="tab" aria-selected={view === "all"}>Todo</a>
            </div>
          ) : null}
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
        {entries.length ? <EntryList entries={entries} next={next} moreHref={here} /> : <Empty view={view} hasFeeds={hasFeeds} emptyFolder={emptyFolder} base={base} />}
      </section>
      </div>
      </div>
    </>
  );
};

const Empty: FC<{ view: View; hasFeeds: boolean; emptyFolder: boolean; base: string }> = ({ view, hasFeeds, emptyFolder, base }) => {
  if (emptyFolder) {
    return (
      <div class="empty">
        <h2>Esta carpeta está vacía</h2>
        <p>Para agregar una fuente, pulsa ⋯ junto a ella en la barra lateral y elige “Mover a carpeta…”.</p>
      </div>
    );
  }
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
