# Instrucciones para el agente

Lector RSS multiusuario. Cuentas con correo y contraseña, fuentes compartidas entre usuarios, carpetas, vista previa, OPML y panel `/admin`.

## Stack

Cloudflare Workers + D1 (SQLite) + Cron Triggers. Hono con JSX renderizado en el servidor, TypeScript estricto, vitest. Una sola dependencia de ejecución aparte de Hono: `fast-xml-parser`. Sin framework de frontend: `public/app.js` es JavaScript plano.

## Mapa del repositorio

- `src/index.tsx`: rutas (Hono), cabeceras de seguridad, defensa CSRF, sesión y cron.
- `src/auth.ts`: contraseñas (PBKDF2), sesiones, límite de intentos.
- `src/admin.ts`: ajustes de la instancia y gestión de usuarios.
- `src/db.ts`: consultas a D1; todas acotadas por usuario.
- `src/parse.ts`: RSS / Atom / RDF a entradas, limpieza de HTML, favicons.
- `src/fetch.ts`: descarga condicional (ETag), detección de feeds, `normalizeUrl`.
- `src/refresh.ts`: actualización de feeds por lotes (cron y botón Actualizar).
- `src/opml.ts`: importar y exportar OPML.
- `src/assets-version.ts`: GENERADO por `scripts/assets-version.mjs`, ignorado por git. No editar ni versionar.
- `src/views/Layout.tsx`: estructura de página, barra lateral, diálogos, iconos.
- `src/views/Timeline.tsx`: lista de artículos y estados vacíos.
- `src/views/Auth.tsx`, `src/views/Admin.tsx`: pantallas de acceso y de administración.
- `src/views/time.ts`: `relTime`, fechas relativas en español.
- `public/app.css`: sistema de diseño (reglas en su comentario inicial). `public/app.js`: interacción del navegador.
- `public/_headers`: caché de los assets estáticos.
- `migrations/`: esquema de D1, archivos numerados `NNNN_nombre.sql`.
- `test/`: pruebas vitest (`parse`, `auth`, `security`).
- `scripts/assets-version.mjs`: genera `src/assets-version.ts`.
- `wrangler.jsonc`: configuración de Cloudflare. **No se toca.**

## Comandos

```bash
npm ci               # instalar (ya hecho por el entorno del agente)
npm run typecheck    # tsc --noEmit
npm test             # vitest run
```

Ambos corren en Node plano, sin Cloudflare ni red. Sus pre-scripts generan `src/assets-version.ts` solos.
No hay linter ni formateador: copia el estilo del archivo que editas (comillas dobles, punto y coma, 2 espacios).

## Obligatorio antes de abrir el PR

Ejecuta `npm run typecheck` y `npm test`. **El estado final (último commit) debe pasar los dos.** Si fallan, corrígelo antes de abrir el PR. No abras el PR con tests rotos ni los desactives para que pasen.
Revisa `git diff --stat`: solo deben aparecer archivos del issue. Si tocaste algo ajeno, revértelo.

## TDD

- **Errores (bugs):** SIEMPRE test primero. **Funcionalidades con lógica** (parsing, DB, rutas, funciones puras): test primero.
- **No aplica:** cambios solo de UI/CSS, documentación, e issues cuyo entregable son solo tests.
- **Verificable con dos commits separados, sin squash:**
  1. `test:` agrega los tests que **FALLAN** contra el código actual. Debe pasar `npm run typecheck`; solo `npm test` puede fallar, y solo por los tests nuevos.
  2. `feat:` o `fix:` con la implementación que los hace pasar.
- En el PR indica qué test falló antes de la implementación y el mensaje o motivo del fallo, copiado de la salida real de `npm test` del primer commit.
- Si el issue está exento, escribe en el PR "TDD: no aplica (motivo)".

## No romper lo que funciona

- Antes de cambiar una condición, un fallback (`||`, `??`), un `return null` temprano, un filtro o un valor por defecto, lista qué entradas toman hoy ese camino y **conserva su comportamiento** salvo que el issue pida cambiarlo.
- Cada comportamiento que conserves y no tenga test lleva un test que lo fije (pruebas de caracterización). Pueden ir en el commit `test:` y pasar ya antes del arreglo; dilo en el PR.
- Si quitas o cambias un fallback, compara antes y después al menos: el caso del issue, el caso con todos los campos presentes y cada caso con exactamente un campo ausente.

## Convenciones

- **Idioma:** comentarios, textos de interfaz, mensajes de error y documentación en español. Los identificadores de código ya existentes se mantienen.
- **Commits:** asunto `feat:`, `fix:`, `test:` o `refactor:` más cuerpo con viñetas. Sin trailers `Co-Authored-By`. Si aplica TDD, el commit `test:` va antes que el de la implementación y no se aplastan (ver TDD).
- **Diffs pequeños y enfocados:** solo lo que pide el issue. Sin refactors, renombrados ni "mejoras" aparte.
- **Sin dependencias nuevas** salvo que el issue lo permita explícitamente.
- **Tests:** todo cambio de comportamiento lleva test en `test/`, escrito antes que la implementación cuando aplica TDD. Funciones puras, con entradas concretas. Para D1 usa una base falsa local (ver `fakeDb` en `test/security.test.ts`) y `vi.stubGlobal("fetch", ...)` para la red; nunca red real.
- **Sin servidor de desarrollo:** no puedes ejecutar `wrangler dev`. Verifica con typecheck y tests.

## Sistema de diseño (`public/app.css`)

Lee el comentario inicial de `public/app.css` antes de tocar la interfaz. Resumen:

- Tema oscuro único. Usa **solo tokens** (`var(--background)`, `--foreground`, `--muted-foreground`, `--border`, `--primary`, `--action`, `--destructive`, `--radius*`). Nada de colores hexadecimales sueltos en componentes.
- Reutiliza componentes: `.btn` (+ `-primary`, `-secondary`, `-outline`, `-ghost`, `-destructive`, `-sm`, `-icon`), `.input`, `.select`, `.field`, `.badge`, `.alert`, `.card`, `.dialog`, `.drawer`, `.menu`, `.row`, `.entry`, `.prose`. No inventes variantes.
- Verde (`--action`) solo para la acción principal de cada pantalla. Fuente mono solo en la marca y en etiquetas de sección.
- Sin animaciones al cargar (las transiciones existen solo tras la primera interacción: `body.anim`). Sin sombras salvo en overlays. Sin `text-decoration` en enlaces. Rejilla de 4px.
- Debe funcionar en móvil. Si el cambio toca la UI, descríbelo en el PR (no hay capturas automáticas).

## Seguridad: no debilitar

- **CSP** en `src/index.tsx` (`secureHeaders`): sin scripts ni estilos en línea (`<script>…</script>`, `style="…"`, `onclick=`), sin orígenes externos. Todo JS va en `public/app.js` y todo CSS en `public/app.css`. Las imágenes solo vienen de `'self'` o `https:`.
- **CSRF:** los POST rechazan `Origin` de otro host. No quites ni relajes esa comprobación. No uses `referrerPolicy: "no-referrer"` (rompe esa defensa).
- Toda consulta en `src/db.ts` va acotada por `user_id` y con parámetros enlazados (`.bind`), nunca concatenando entradas del usuario.
- Contraseñas, tokens de sesión, `ADMIN_EMAILS` e `INVITE_CODE` nunca se registran en logs, ni se escriben en el código o en los tests.
- Redirecciones solo a rutas internas (ver `safeBack`).

## Base de datos

- Un cambio de esquema es **un archivo nuevo** `migrations/NNNN_descripcion.sql` con el siguiente número. **Nunca edites migraciones existentes.**
- **Nunca** apliques migraciones en remoto (`db:remote`) ni ejecutes `wrangler` contra Cloudflare. La persona responsable las aplica a mano antes del merge. Menciónalo en el PR si agregas una.
- El esquema debe ser retrocompatible con el código desplegado (agregar, no renombrar ni borrar).

## Prohibido salvo que el issue lo diga expresamente

- Editar `wrangler.jsonc`, `package.json` (dependencias o scripts), `package-lock.json`, `tsconfig.json`.
- Ejecutar o modificar el despliegue, tocar secretos o variables de entorno.
- Editar `.github/workflows/`, `.github/ISSUE_TEMPLATE/` o este archivo.
- Reformatear archivos enteros o cambiar el orden de código que no es del issue.

## Si el issue es ambiguo

Haz la interpretación mínima razonable, **no amplíes el alcance**, y escribe tus supuestos en la sección "Supuestos" de la descripción del PR. No hagas preguntas ni dejes el trabajo a medias: entrega lo que sí está claro.
Todo valor, texto, default o comportamiento que el issue no especifica y que tú elegiste (p. ej. un texto de fallback, descartar o conservar un registro, un mensaje de error) es un supuesto y **DEBE** figurar en "Supuestos" junto con la alternativa que descartaste. "Ninguno" solo es válido si cada decisión está dicha literalmente en el issue.
Si algo del issue es imposible sin tocar un archivo prohibido, entrega el resto y explícalo en el PR.

## Descripción del PR

Usa la plantilla (`.github/pull_request_template.md`): qué cambia, `Closes #N`, cómo se probó (con el resultado real de typecheck y test), el fallo original del test (o "TDD: no aplica (motivo)"), supuestos (con la alternativa descartada), "Comportamiento que cambia para casos fuera del issue" (obligatorio, una línea: qué cambia, o "ninguno, verificado con tests X") y, si toca la UI, qué se ve distinto.
