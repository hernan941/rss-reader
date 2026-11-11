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
<div class="card">
            <p class="lead">{login ? "Entra para ver tus fuentes." : closed ? "El registro no está disponible." : "Crea una cuenta para guardar tus fuentes."}</p>
            {err ? <div class="alert alert-err" role="alert">{err}</div> : null}
            {closed && !login ? (
              <div class="alert alert-err" role="status">{closed}</div>
            ) : (
            <form method="post" action={login ? "/login" : "/register"} data-busy={login ? "Entrando…" : "Creando…"}>
              <div class="field">
                <label class="label" for="email">Correo</label>
                <input class="input" id="email" type="email" name="email" value={email ?? ""} required autocomplete="email" autofocus />
              </div>
              <div class="field">
                <label class="label" for="password">Contraseña</label>
                <input class="input" id="password" type="password" name="password" required minlength={login ? undefined : 8} autocomplete={login ? "current-password" : "new-password"} />
                {login ? null : <p class="hint">Mínimo 8 caracteres.</p>}
              </div>
              {needInvite && !login ? (
                <div class="field">
                  <label class="label" for="invite">Código de invitación</label>
                  <input class="input" id="invite" type="text" name="invite" required autocomplete="off" />
                </div>
              ) : null}
              <button class="btn btn-primary btn-block" type="submit"><span>{login ? "Entrar" : "Crear cuenta"}</span></button>
            </form>
            )}
            <p class="switch">
              {login ? (canRegister ? <>¿No tienes cuenta? <a href="/register">Regístrate</a></> : null) : <>¿Ya tienes cuenta? <a href="/login">Entra</a></>}
            </p>
</div>
          </main>
        </body>
      </html>
    </>
  );
};
