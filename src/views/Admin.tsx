import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import type { AdminUser, RegistrationState } from "../admin";
import { Head } from "./Layout";
import { relTime } from "./time";

const ONLINE_MS = 10 * 60_000;

interface Props {
  me: { id: number; email: string };
  users: AdminUser[];
  admins: string[];
  reg: RegistrationState;
  stats: { feeds: number; entries: number };
  msg?: string;
  err?: string;
}

const regLabel = (r: RegistrationState) =>
  r.open
    ? `Abierto${r.max ? ` · ${r.users} de ${r.max} usuarios` : ` · ${r.users} usuarios`}`
    : r.reason === "limit"
      ? `Cerrado automáticamente · se alcanzó el límite de ${r.max} usuarios`
      : "Cerrado manualmente";

export const AdminPage: FC<Props> = ({ me, users, admins, reg, stats, msg, err }) => {
  const now = Date.now();
  const online = users.filter((u) => u.sessions > 0 && now - u.last_seen_at < ONLINE_MS).length;
  const isAdminEmail = (e: string) => admins.includes(e.toLowerCase());

  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="es">
        <Head title="Administración" />
        <body class="admin-body">
          <main class="admin">
            <header class="admin-head">
              <h1 class="brand"><span class="prompt">$</span> sudo admin<span class="cursor">_</span></h1>
              <a class="btn btn-ghost btn-sm" href="/">← Volver al lector</a>
            </header>

            {msg ? <div class="alert alert-ok" role="status">{msg}</div> : null}
            {err ? <div class="alert alert-err" role="alert">{err}</div> : null}

            <div class="stats">
              <div><b>{users.length}</b><span>usuarios</span></div>
              <div><b>{online}</b><span>en línea</span></div>
              <div><b>{stats.feeds}</b><span>fuentes</span></div>
              <div><b>{stats.entries}</b><span>artículos</span></div>
            </div>

            <section>
              <h2>Registro</h2>
              <p class={`reg ${reg.open ? "is-open" : "is-closed"}`}><span class="dot" /> {regLabel(reg)}</p>
              <div class="reg-actions">
                {reg.open ? (
                  <form method="post" action="/admin/registration">
                    <input type="hidden" name="open" value="0" />
                    <button class="btn btn-outline btn-sm" type="submit">Cerrar registro</button>
                  </form>
                ) : reg.reason === "manual" ? (
                  <form method="post" action="/admin/registration">
                    <input type="hidden" name="open" value="1" />
                    <button class="btn btn-primary btn-sm" type="submit">Abrir registro</button>
                  </form>
                ) : null}
                <form method="post" action="/admin/max-users" class="inline">
                  <div class="field">
                    <label class="label" for="max">Límite de usuarios</label>
                    <input class="input" id="max" type="number" name="max" min="0" max="100000" value={String(reg.max)} />
                  </div>
                  <button class="btn btn-secondary" type="submit">Guardar</button>
                </form>
              </div>
              <p class="hint">Con un límite, el registro se cierra solo al alcanzarlo; para abrirlo de nuevo sube el límite o ponlo en 0 (sin límite).</p>
            </section>

            <section>
              <h2>Usuarios</h2>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr><th>Correo</th><th>Actividad</th><th class="num">Sesiones</th><th class="num">Fuentes</th><th>Alta</th><th></th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const self = u.id === me.id;
                      const protectedUser = self || isAdminEmail(u.email);
                      const live = u.sessions > 0 && now - u.last_seen_at < ONLINE_MS;
                      return (
                        <tr class={u.disabled ? "off" : ""}>
                          <td class="email">
                            {u.email}
                            {isAdminEmail(u.email) ? <span class="tag">admin</span> : null}
                            {u.disabled ? <span class="tag warn">suspendido</span> : null}
                          </td>
                          <td>
                            {live ? <span class="online"><span class="dot" /> en línea</span> : u.last_seen_at ? <span class="muted">{relTime(u.last_seen_at, now)}</span> : <span class="muted">nunca</span>}
                          </td>
                          <td class="num">{u.sessions}</td>
                          <td class="num">{u.feeds}</td>
                          <td class="muted">{new Date(u.created_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td class="acts-cell">
                            <div class="acts">
                            {protectedUser ? (
                              <span class="muted">{self ? "tú" : ""}</span>
                            ) : (
                              <>
                                <form method="post" action={`/admin/users/${u.id}/kick`}>
                                  <button class="btn btn-ghost btn-sm" type="submit" disabled={u.sessions === 0} title="Cierra sus sesiones; podrá volver a entrar">Expulsar</button>
                                </form>
                                <form method="post" action={`/admin/users/${u.id}/${u.disabled ? "enable" : "suspend"}`}>
                                  <button class={`btn btn-sm ${u.disabled ? "btn-ghost" : "btn-destructive"}`} type="submit" title={u.disabled ? "Permitirle entrar de nuevo" : "Cierra sus sesiones e impide que vuelva a entrar"}>{u.disabled ? "Reactivar" : "Suspender"}</button>
                                </form>
                                <form method="post" action={`/admin/users/${u.id}/delete`} data-confirm={`¿Eliminar a ${u.email} y todos sus datos? No se puede deshacer.`}>
                                  <button class="btn btn-destructive btn-sm" type="submit">Eliminar</button>
                                </form>
                              </>
                            )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p class="hint">“En línea” = sesión activa y actividad en los últimos 10 minutos. Los administradores se definen en <code>ADMIN_EMAILS</code>.</p>
            </section>
          </main>
        </body>
      </html>
    </>
  );
};
