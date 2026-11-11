import type { FC } from "hono/jsx";
import type { Entry, Sub, View } from "../db";
import { Icon, MenuBtn } from "./Layout";
import { relTime } from "./time";

/** Algunos feeds (p. ej. Hacker News) solo traen enlaces como resumen: es ruido, se oculta. */
const usefulSummary = (s: string) => (s && !/^Article URL:/i.test(s) ? s : "");

export const EntryItem: FC<{ e: Entry; now: number }> = ({ e, now }) => (
  <article class={`entry${e.is_read ? " read" : ""}${e.is_starred ? " starred" : ""}`} data-id={e.id} data-feed={e.feed_id} data-image={e.image || undefined}>
    <button type="button" class="act star btn btn-ghost btn-icon btn-sm" data-act="star" aria-label="Guardar" title="Guardar (s)"><Icon name="star" /></button>
    <span class="source">{e.feed_title}</span>
    <a class="entry-main" href={e.link} target="_blank" rel="noopener noreferrer">
      <span class="title">{e.title}</span>
      {usefulSummary(e.summary) ? <span class="sum">{usefulSummary(e.summary)}</span> : null}
    </a>
    <time class="when" datetime={new Date(e.sort_at).toISOString()}>{relTime(e.sort_at, now)}</time>
    <button type="button" class="act check btn btn-ghost btn-icon btn-sm" data-act="read" aria-label="Marcar como leído" title="Leído / no leído (m)"><Icon name="check" /></button>
  </article>
);

export const EntryList: FC<{ entries: Entry[]; next: string | null; moreHref: string }> = ({ entries, next, moreHref }) => {
  const now = Date.now();
  return (
    <>
      {entries.map((e) => <EntryItem e={e} now={now} />)}
      {next ? (
        <button type="button" class="more btn btn-outline" data-href={`${moreHref}${moreHref.includes("?") ? "&" : "?"}before=${next}`}>
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
  const here = view === "starred" ? `${base}?v=starred` : base;
  const hidden = (
    <>
      <input type="hidden" name="back" value={here} />
      {feed ? <input type="hidden" name="feed" value={String(feed.id)} /> : null}
      {folder !== undefined ? <input type="hidden" name="folder" value={folder} /> : null}
    </>
  );

  return (
    <>
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
          <form method="post" action="/refresh" data-busy="Actualizando…">
            <input type="hidden" name="back" value={here} />
            <button class="btn btn-ghost btn-sm" type="submit" title="Buscar novedades ahora" aria-label="Actualizar"><Icon name="refresh" /> <span>Actualizar</span></button>
          </form>
          {view !== "starred" ? (
            <form method="post" action="/read-all">
              {hidden}
              <button class="btn btn-ghost btn-sm" type="submit" title="Marcar todo como leído" aria-label="Marcar todo leído"><Icon name="check" /> <span>Marcar todo leído</span></button>
            </form>
          ) : null}
          {feed ? <MenuBtn head kind="feed" id={feed.id} name={feed.name} folder={feed.folder} /> : null}
          {folder !== undefined ? <MenuBtn head kind="folder" name={folder} /> : null}
        </div>
      </div>

      {feed?.last_error ? <div class="alert alert-err">Última actualización fallida: {feed.last_error}</div> : null}

      <section class="list" id="list">
        {entries.length ? <EntryList entries={entries} next={next} moreHref={here} /> : <Empty view={view} hasFeeds={hasFeeds} emptyFolder={emptyFolder} folder={folder} />}
      </section>
    </>
  );
};

const Empty: FC<{ view: View; hasFeeds: boolean; emptyFolder: boolean; folder?: string }> = ({ view, hasFeeds, emptyFolder, folder }) => {
  if (emptyFolder) {
    return (
      <div class="empty">
        <h2>Esta carpeta está vacía</h2>
        <p>Agrega una fuente aquí, o muévela desde el menú ⋯ de cualquier fuente.</p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" data-add-feed data-folder={folder}>Agregar fuente</button>
        </div>
      </div>
    );
  }
  if (!hasFeeds) {
    return (
      <div class="empty">
        <h2>Agrega tu primera fuente</h2>
        <p>Pega la dirección de un blog o sitio y buscaré el feed por ti. También puedes importar un archivo OPML desde Feedly.</p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" data-add-feed>Agregar fuente</button>
          <button type="button" class="btn btn-secondary" data-import>Importar OPML</button>
        </div>
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
