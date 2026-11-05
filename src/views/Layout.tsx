import { raw } from "hono/html";
import type { Child, FC } from "hono/jsx";
import type { Sub, View } from "../db";

export const hue = (id: number) => (id * 67) % 360;

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
};

export const Icon: FC<{ name: keyof typeof PATHS }> = ({ name }) => (
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Cpath d='M9 22a1.5 1.5 0 110 .01M9 15a8 8 0 018 8M9 9a14 14 0 0114 14' stroke='white' stroke-width='2.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E";

export const Head: FC<{ title: string }> = ({ title }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>{title} · Lector RSS</title>
    <link rel="icon" href={FAVICON} />
    <link rel="stylesheet" href="/app.css" />
    <script src="/app.js" defer></script>
  </head>
);

export const MenuBtn: FC<{ kind: "feed" | "folder"; id?: number; name: string; folder?: string; head?: boolean }> = (p) => (
  <button type="button" class={`row-menu${p.head ? " head-menu" : ""}`} aria-label="Acciones" aria-haspopup="menu" aria-expanded="false" title="Acciones" data-kind={p.kind} data-id={p.id} data-name={p.name} data-folder={p.folder ?? ""}>
    <Icon name="more" />
  </button>
);

const FeedRow: FC<{ f: Sub; activeId?: number }> = ({ f, activeId }) => (
  <div class={`row${activeId === f.id ? " active" : ""}`}>
    <a href={`/feed/${f.id}?v=all`} title={f.last_error ? `Error: ${f.last_error}` : f.url}>
      <span class="avatar" style={`--h:${hue(f.id)}`}>{f.name.charAt(0).toUpperCase()}</span>
      <span class="name">{f.name}</span>
      {f.last_error ? <span class="warn" title={f.last_error}>!</span> : null}
      <span class="count" data-feed-count={f.id}>{f.unread || ""}</span>
    </a>
    <MenuBtn kind="feed" id={f.id} name={f.name} folder={f.folder} />
  </div>
);

interface Props {
  user: { email: string };
  admin?: boolean;
  subs: Sub[];
  starred: number;
  view: View;
  feedId?: number;
  folder?: string;
  title: string;
  msg?: string;
  err?: string;
  children?: Child;
}

export const Layout: FC<Props> = ({ user, admin, subs, starred, view, feedId, folder, title, msg, err, children }) => {
  const unread = subs.reduce((n, f) => n + f.unread, 0);
  const folders = new Map<string, Sub[]>();
  for (const f of subs) if (f.folder) folders.set(f.folder, [...(folders.get(f.folder) ?? []), f]);
  const loose = subs.filter((f) => !f.folder);
  const home = !feedId && folder === undefined;

  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="es">
        <Head title={title} />
        <body>
          <header class="topbar">
            <button class="icon-btn" id="menu" type="button" aria-label="Menú"><Icon name="menu" /></button>
            <strong>{title}</strong>
          </header>

          <aside class="sidebar" id="sidebar">
            <form class="add" method="post" action="/feeds" data-busy="Buscando…">
              <input type="text" name="url" placeholder="Agregar fuente: pega una dirección" required autocomplete="off" aria-label="Dirección del feed" />
              <button type="submit" aria-label="Agregar"><Icon name="plus" /></button>
            </form>

            <nav class="nav">
              <a href="/?v=unread" class={home && view === "unread" ? "active" : ""}>
                <Icon name="inbox" /> <span class="name">Sin leer</span> <span class="count" data-total-unread>{unread || ""}</span>
              </a>
              <a href="/?v=all" class={home && view === "all" ? "active" : ""}>
                <Icon name="list" /> <span class="name">Todo</span>
              </a>
              <a href="/?v=starred" class={home && view === "starred" ? "active" : ""}>
                <Icon name="star" /> <span class="name">Guardados</span> <span class="count">{starred || ""}</span>
              </a>
            </nav>

            <div class="section-title">Fuentes</div>
            <nav class="feeds">
              {[...folders].map(([name, list]) => (
                <details class="folder" open data-folder={name}>
                  <summary class={`row${folder === name ? " active" : ""}`}>
                    <span class="chev"><Icon name="chevron" /></span>
                    <a href={`/folder/${encodeURIComponent(name)}?v=unread`} class="name">{name}</a>
                    <span class="count">{list.reduce((n, f) => n + f.unread, 0) || ""}</span>
                    <MenuBtn kind="folder" name={name} />
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
              <div class="who" title={user.email}>{user.email}</div>
              <div class="links">
                <form method="post" action="/opml" enctype="multipart/form-data" id="opml-form">
                  <label class="link-btn">
                    Importar
                    <input type="file" name="file" accept=".opml,.xml,text/xml" hidden />
                  </label>
                </form>
                <a class="link-btn" href="/opml" download="feeds.opml">Exportar</a>
                {admin ? <a class="link-btn" href="/admin">Admin</a> : null}
                <form method="post" action="/logout"><button class="link-btn" type="submit">Salir</button></form>
              </div>
            </div>
          </aside>
          <div class="scrim" id="scrim"></div>

          <main class="content">
            {msg ? <div class="flash ok" role="status">{msg}</div> : null}
            {err ? <div class="flash err" role="alert">{err}</div> : null}
            {children}
          </main>

          <dialog id="dlg">
            <form method="dialog">
              <label id="dlg-label" for="dlg-input"></label>
              <input id="dlg-input" list="folder-list" autocomplete="off" maxlength={120} />
              <datalist id="folder-list">{[...folders.keys()].map((n) => <option value={n} />)}</datalist>
              <div class="dlg-actions">
                <button class="btn" type="button" id="dlg-cancel">Cancelar</button>
                <button class="btn primary" value="ok">Guardar</button>
              </div>
            </form>
          </dialog>
        </body>
      </html>
    </>
  );
};
