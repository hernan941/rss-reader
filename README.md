# Lector RSS

Un lector RSS simple y multiusuario. Cada persona crea su cuenta, pega la dirección de un blog (o de su feed) y los artículos van apareciendo y quedando guardados.

Corre en Cloudflare, normalmente dentro del plan gratuito:
**Workers** (páginas + API) · **D1** (SQLite) · **Cron Triggers** (actualiza cada 15 min) · **Hono** + TypeScript.

## Qué hace

- **Cuentas:** registro e inicio de sesión con correo y contraseña.
- **Panel `/admin`:** ver usuarios y quién está en línea, expulsarlos, suspenderlos o eliminarlos, y abrir/cerrar el registro (o ponerle un límite de usuarios).
- **Agregar fuentes:** pega la URL de un sitio o de un feed; detecta el feed automáticamente.
- **Lista densa** (una fila por artículo) con lo último de todas tus fuentes: *Sin leer / Todo / Guardados*.
- **Barra lateral con acciones:** el botón `⋯` de cada fuente y carpeta (y de la cabecera) abre un menú: marcar como leído, renombrar, mover a carpeta, dejar de seguir.
- **Carpetas** para agrupar fuentes.
- **Guardar** artículos con la estrella; **marcar leído** al abrirlos (o a mano).
- **Importar / exportar OPML** (con carpetas), para traer tus feeds desde Feedly.
- Atajos: `j`/`k` moverse · `o` abrir · `s` guardar · `m` leído/no leído · `/` agregar fuente.
- Modo oscuro automático y diseño adaptado a móvil.

## Desarrollo local

```bash
npm install
npm run db:local     # crea las tablas en la base local
npm run dev          # http://localhost:8787
npm test             # tests (parser, OPML, contraseñas)
npm run typecheck
```

## Publicar en Cloudflare

```bash
npx wrangler login
npx wrangler d1 create rss-dashboard      # copia el database_id a wrangler.jsonc
npm run db:remote                         # aplica las migraciones
npm run deploy
```

### Administradores

El acceso a `/admin` lo da la variable `ADMIN_EMAILS` (correos separados por comas). Sin ella **nadie** es admin
y el panel responde 404. Se define a propósito en la configuración y no como "el primero que se registra",
para que nadie pueda adelantarse a ti en un despliegue público.

```bash
npx wrangler secret put ADMIN_EMAILS      # p. ej. tu@correo.com
```

En local: copia `.dev.vars.example` a `.dev.vars`, pon tu correo y reinicia `npm run dev`. La cuenta debe existir
(regístrate primero); el enlace **Admin** aparece entonces en el pie de la barra lateral.

Desde el panel:

| Acción | Efecto |
|---|---|
| **Expulsar** | Cierra todas sus sesiones. Puede volver a entrar. |
| **Suspender / Reactivar** | Cierra sus sesiones e impide que entre hasta reactivarlo. |
| **Eliminar** | Borra la cuenta y todos sus datos (suscripciones, estado de lectura, guardados). Pide confirmación. |
| **Cerrar / abrir registro** | Interruptor manual. |
| **Límite de usuarios** | El registro se cierra solo al alcanzarlo (0 = sin límite). |

Los administradores no pueden expulsarse, suspenderse ni eliminarse entre sí desde el panel. Para quitar a
alguien como admin, sácalo de `ADMIN_EMAILS`.

### Registro con invitación (opcional)

Además del interruptor, puedes exigir un código para registrarse:

```bash
npx wrangler secret put INVITE_CODE
```

## Cómo funciona (y sus límites)

- **Los feeds se comparten:** si 50 personas siguen el mismo blog, se descarga una sola vez. Cada persona tiene
  sus propias suscripciones, nombres, carpetas, y estado de leído/guardado.
- **Cron:** cada 15 min revisa los feeds menos recientes (solo los que tienen suscriptores), en lotes de 40 para
  respetar el límite de peticiones salientes del plan gratuito. Usa `ETag`/`Last-Modified`.
- **"Sin leer" cubre los últimos 14 días:** lo más antiguo cuenta como leído. Mantiene las consultas baratas
  (D1 cobra por filas leídas). Los guardados no caducan.
- **Tope de 300 fuentes por usuario** (`MAX_FEEDS_PER_USER` en `src/db.ts`).

## Seguridad

- Contraseñas con PBKDF2-SHA256 (100 000 iteraciones, el máximo que permite Workers) y sal propia.
- Sesión en cookie `HttpOnly`, `SameSite=Lax` (y `Secure` en HTTPS); en la base solo se guarda el hash del token.
- Límite de intentos: 8 fallos de login por correo / 40 por IP cada 15 min; 5 registros por IP por hora.
- Los formularios rechazan peticiones de otro origen (defensa CSRF extra).
- **No hay verificación de correo ni recuperación de contraseña** (no hay servicio de correo configurado).
  Si alguien olvida su contraseña, hay que cambiarla a mano en la base de datos.
- Si el plan gratuito de Workers corta el login por el límite de CPU (10 ms), la solución es el plan de pago
  de Workers (unos 5 USD/mes) o bajar `PBKDF2_ITERATIONS` en `src/auth.ts` (a costa de seguridad).

## Estructura

```
src/index.tsx      rutas (Hono), sesión y cron
src/auth.ts        contraseñas, sesiones, límite de intentos
src/admin.ts       ajustes de la instancia y gestión de usuarios
src/db.ts          consultas a D1 (todas acotadas por usuario)
src/parse.ts       RSS / Atom / RDF → entradas
src/fetch.ts       descarga condicional y detección de feeds
src/refresh.ts     actualización por lotes
src/opml.ts        importar / exportar
src/views/         páginas (JSX del servidor)
public/            app.css y app.js
migrations/        esquema de D1
test/              pruebas (vitest)
```
