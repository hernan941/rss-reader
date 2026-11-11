import { raw } from "hono/html";
import type { Child, FC } from "hono/jsx";
import type { Sub, View } from "../db";

const PATHS: Record<string, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  plus: "M12 5v14M5 12h14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  chevron: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  updown: "M8 9l4-4 4 4M16 15l-4 4-4-4",
};

export const Icon: FC<{ name: keyof typeof PATHS }> = ({ name }) => (
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

export const Head: FC<{ title: string }> = ({ title }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#1d1f27" />
    <title>{title} · Lector RSS</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="/app.css" />
    <script src="/app.js" defer></script>
  </head>
);

export const MenuBtn: FC<{ kind: "feed" | "folder"; id?: number; name: string; folder?: string; head?: boolean }> = (p) => (
  <button type="button" class={`row-menu btn btn-ghost btn-icon${p.head ? " head-menu" : " btn-sm"}`} aria-label="Acciones" aria-haspopup="menu" aria-expanded="false" title="Acciones" data-kind={p.kind} data-id={p.id} data-name={p.name} data-folder={p.folder ?? ""}>
    <Icon name="more" />
  </button>
);

const FeedRow: FC<{ f: Sub; activeId?: number }> = ({ f, activeId }) => (
  <div class={`row${activeId === f.id ? " active" : ""}`}>
    <a href={`/feed/${f.id}`} title={f.last_error ? `Error: ${f.last_error}` : f.url}>
      <span class="avatar">
        <span class="ph">{f.name.charAt(0).toUpperCase()}</span>
        {f.favicon_url ? <img class="favicon" src={f.favicon_url} alt="" loading="lazy" /> : null}
      </span>
      <span class="name">{f.name}</span>
      {f.last_error ? <span class="warn" title={f.last_error}>!</span> : null}
      <span class="count badge" data-feed-count={f.id}>{f.unread || ""}</span>
    </a>
    <span class="row-actions">
      <MenuBtn kind="feed" id={f.id} name={f.name} folder={f.folder} />
    </span>
  </div>
);

interface Props {
  user: { email: string };
  admin?: boolean;
  subs: Sub[];
  folders: string[];
  starred: number;
  view: View;
  feedId?: number;
  folder?: string;
  title: string;
  msg?: string;
  err?: string;
  closedFolders?: string[];
  children?: Child;
}

export const Layout: FC<Props> = ({ user, admin, subs, folders: folderNames, starred, view, feedId, folder, title, msg, err, closedFolders = [], children }) => {
  const unread = subs.reduce((n, f) => n + f.unread, 0);
  const names = new Set(folderNames);
  for (const f of subs) if (f.folder) names.add(f.folder);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const folders = new Map<string, Sub[]>(sorted.map((n) => [n, subs.filter((f) => f.folder === n)]));
  const loose = subs.filter((f) => !f.folder);
  const home = !feedId && folder === undefined;
  const closed = new Set(closedFolders);

  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="es">
        <Head title={title} />
        <body>
          <header class="topbar">
            <button class="btn btn-ghost btn-icon" id="menu" type="button" aria-label="Menú"><Icon name="menu" /></button>
            <strong>{title}</strong>
          </header>

          <aside class="sidebar" id="sidebar">
            <a href="/" class="brand"><span class="prompt">$</span> echo "reader"<span class="cursor">_</span></a>

            <nav class="nav">
              <a href="/" class={home && view === "all" ? "active" : ""}>
                <Icon name="inbox" /> <span class="name">Todo</span> <span class="count badge" data-total-unread>{unread || ""}</span>
              </a>
              <a href="/?v=starred" class={home && view === "starred" ? "active" : ""}>
                <Icon name="star" /> <span class="name">Guardados</span> <span class="count badge">{starred || ""}</span>
              </a>
            </nav>

            <div class="section-title">
              <span>Fuentes</span>
              <button class="row-menu btn btn-ghost btn-icon btn-sm" type="button" aria-label="Agregar" title="Agregar" aria-haspopup="menu" aria-expanded="false" data-kind="add">
                <Icon name="plus" />
              </button>
            </div>
            <nav class="feeds">
              {[...folders].map(([name, list]) => (
                <details class="folder" open={!closed.has(name) || folder === name || list.some((f) => f.id === feedId)} data-folder={name}>
                  <summary class={`row${folder === name ? " active" : ""}`}>
                    <span class="chev"><Icon name="chevron" /></span>
                    <a href={`/folder/${encodeURIComponent(name)}`} class="name">{name}</a>
                    <span class="count badge">{list.reduce((n, f) => n + f.unread, 0) || ""}</span>
                    <span class="row-actions">
                      <button type="button" class="row-add btn btn-ghost btn-icon btn-sm" aria-label={`Agregar fuente a ${name}`} title="Agregar fuente" data-folder={name}>
                        <Icon name="plus" />
                      </button>
                      <MenuBtn kind="folder" name={name} />
                    </span>
                  </summary>
                  <div class="children">
                    {list.map((f) => <FeedRow f={f} activeId={feedId} />)}
                  </div>
                </details>
              ))}
              {loose.map((f) => <FeedRow f={f} activeId={feedId} />)}
              {!subs.length ? <p class="hint">Aún no sigues ninguna fuente.</p> : null}
            </nav>

            <div class="sidebar-foot">
              <button type="button" class="account row-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Cuenta" data-kind="account" data-admin={admin ? "1" : undefined} title={user.email}>
                <span class="avatar avatar-user">{user.email.charAt(0).toUpperCase()}</span>
                <span class="name">{user.email}</span>
                <Icon name="updown" />
              </button>
              <form method="post" action="/opml" enctype="multipart/form-data" id="opml-form" hidden>
                <input type="file" name="file" accept=".opml,.xml,text/xml" />
              </form>
            </div>
          </aside>
          <div class="scrim" id="scrim"></div>

          <main class="content">
            {msg ? <div class="alert alert-ok" role="status">{msg}</div> : null}
            {err ? <div class="alert alert-err" role="alert">{err}</div> : null}
            {children}
          </main>

          <dialog id="preview" class="drawer" aria-labelledby="preview-title">
            <div class="drawer-head">
              <button class="btn btn-ghost btn-icon" id="preview-close" type="button" aria-label="Cerrar"><Icon name="close" /></button>
            </div>
            <div class="drawer-body">
              <p class="drawer-meta"><span id="preview-source"></span> · <span id="preview-when"></span></p>
              <h2 id="preview-title"></h2>
              <div id="preview-media"></div>
              <div id="preview-summary" class="prose"></div>
            </div>
            <div class="drawer-actions">
              <a class="btn btn-primary" id="preview-link" target="_blank" rel="noopener noreferrer">Leer artículo completo</a>
              <button class="btn btn-outline" id="preview-star" type="button"></button>
              <button class="btn btn-outline" id="preview-read" type="button"></button>
            </div>
          </dialog>

          <dialog id="add-feed" class="dialog" aria-labelledby="add-feed-title">
            <form method="post" action="/feeds" data-busy="Buscando…">
              <input type="hidden" name="back" value="/" />
              <h2 class="dialog-title" id="add-feed-title">Agregar fuente</h2>
              <p class="dialog-desc">Pega la dirección de un blog o de su feed; lo detecto automáticamente.</p>
              <div class="field">
                <label class="label" for="add-feed-url">Dirección</label>
                <input class="input" id="add-feed-url" type="text" name="url" required autofocus autocomplete="off" placeholder="https://ejemplo.com" />
              </div>
              <div class="field">
                <label class="label" for="add-feed-folder">Carpeta</label>
                <select class="select" id="add-feed-folder" name="folder">
                  <option value="">Sin carpeta</option>
                  {[...folders.keys()].map((n) => <option value={n}>{n}</option>)}
                </select>
              </div>
              <div class="dialog-footer">
                <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
                <button class="btn btn-primary" type="submit"><span>Agregar</span></button>
              </div>
            </form>
          </dialog>

          <dialog id="add-folder" class="dialog" aria-labelledby="add-folder-title">
            <form method="post" action="/folders">
              <input type="hidden" name="back" value="/" />
              <h2 class="dialog-title" id="add-folder-title">Nueva carpeta</h2>
              <div class="field">
                <label class="label" for="add-folder-name">Nombre</label>
                <input class="input" id="add-folder-name" type="text" name="name" required maxlength={40} autocomplete="off" />
              </div>
              <div class="dialog-footer">
                <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
                <button class="btn btn-primary" type="submit">Crear</button>
              </div>
            </form>
          </dialog>

          <dialog id="dlg" class="dialog" aria-labelledby="dlg-title">
            <form method="dialog">
              <h2 class="dialog-title" id="dlg-title"></h2>
              <div class="field">
                <label class="label" id="dlg-label" for="dlg-input"></label>
                <select class="select" id="dlg-select" hidden></select>
                <input class="input" id="dlg-input" autocomplete="off" maxlength={120} />
              </div>
              <div class="dialog-footer">
                <button class="btn btn-ghost" type="button" id="dlg-cancel">Cancelar</button>
                <button class="btn btn-primary" value="ok">Guardar</button>
              </div>
            </form>
          </dialog>
        </body>
      </html>
    </>
  );
};
