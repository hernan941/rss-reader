import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { Head } from "./Layout";

interface Props {
  mode: "login" | "register";
  err?: string;
  email?: string;
  needInvite?: boolean;
  /** Mensaje cuando el registro está cerrado; sustituye al formulario. */
  closed?: string;
  /** En el login: oculta el enlace a "Regístrate" si el registro está cerrado. */
  canRegister?: boolean;
}

export const AuthPage: FC<Props> = ({ mode, err, email, needInvite, closed, canRegister = true }) => {
  const login = mode === "login";
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="es">
        <Head title={login ? "Entrar" : "Crear cuenta"} />
        <body class="auth-body">
          <main class="auth">
            <a href="/login" class="brand"><h1><span class="prompt">$</span> echo "reader"<span class="cursor">_</span></h1></a>
            <div class="term">
              <div class="term-body">
            <p class="lead">{login ? "Entra para ver tus fuentes." : closed ? "El registro no está disponible." : "Crea una cuenta para guardar tus fuentes."}</p>
            {err ? <div class="flash err" role="alert">{err}</div> : null}
            {closed && !login ? (
              <div class="flash err" role="status">{closed}</div>
            ) : (
            <form method="post" action={login ? "/login" : "/register"} data-busy={login ? "Entrando…" : "Creando…"}>
              <label>
                Correo
                <input type="email" name="email" value={email ?? ""} required autocomplete="email" autofocus />
              </label>
              <label>
                Contraseña
                <input type="password" name="password" required minlength={login ? undefined : 8} autocomplete={login ? "current-password" : "new-password"} />
                {login ? null : <small>Mínimo 8 caracteres.</small>}
              </label>
              {needInvite && !login ? (
                <label>
                  Código de invitación
                  <input type="text" name="invite" required autocomplete="off" />
                </label>
              ) : null}
              <button class="btn primary wide" type="submit"><span>{login ? "Entrar" : "Crear cuenta"}</span></button>
            </form>
            )}
            <p class="switch">
              {login ? (canRegister ? <>¿No tienes cuenta? <a href="/register">Regístrate</a></> : null) : <>¿Ya tienes cuenta? <a href="/login">Entra</a></>}
            </p>
              </div>
            </div>
          </main>
        </body>
      </html>
    </>
  );
};
