# Backlog inicial

Issues candidatos, escritos en el formato de las plantillas (`.github/ISSUE_TEMPLATE/`). Cada premisa se verificó contra el código en la fecha de redacción. Para usarlos: crear el issue con la plantilla, pegar cada sección, y asignarlo a Copilot **de uno en uno**.

Orden recomendado: #0 (calibración) primero; después #1 a #4 (baratos, solo tests); luego #5 a #8; el #9 al final.

| # | Título | Tipo | Tamaño |
|---|---|---|---|
| 0 | Tests de `relTime` | test | mínimo (calibración) |
| 1 | Tests de `normalizeUrl` y `cleanFolder` | test | pequeño |
| 2 | Tests de casos límite de OPML | test | pequeño |
| 3 | Tests de `parseFeed`: RDF, tope de 100 y enlaces no válidos | test | pequeño |
| 4 | Tests de `decodeEntities` | test | pequeño |
| 5 | Tests de `refreshFeed` | test | medio |
| 6 | Tests de `discoverFeed` | test | medio |
| 7 | Mostrar los no leídos en el título de la pestaña | feature | pequeño |
| 8 | README: documentar tests, CI y la fábrica | docs | pequeño |
| 9 | Vista "Sin leer" | feature | difícil (prueba de límite) |

---

## #0 [CALIBRACIÓN] Tests de `relTime`

Etiquetas: `feature` (o `test`), `copilot`, `calibracion`.

**Contexto**
`relTime` (`src/views/time.ts`, 11 líneas) formatea las fechas relativas de la lista ("ahora", "hace 5 min", "hace 2 h", "hace 3 d", o fecha corta). Es una función pura que se usa en cada fila de artículo y **no tiene ningún test** (`grep relTime test/` no devuelve nada). Este issue es deliberadamente el más barato y verificable: sirve para medir cuántos créditos cuesta un issue mínimo.

**Qué hay que hacer**
Crear `test/time.test.ts` con tests de `relTime`, sin modificar `src/views/time.ts`. Usar un `now` fijo: `const NOW = Date.parse("2026-06-15T12:00:00Z")` y llamar `relTime(NOW - segundos * 1000, NOW)`. Valores que ya produce la función hoy:

| Segundos atrás | Resultado |
|---|---|
| 0, 30, 59 | `ahora` |
| 60, 89 | `hace 1 min` |
| 90 | `hace 2 min` |
| 3599, 3600 | `hace 1 h` |
| 86399, 86400 | `hace 1 d` |
| 6 días (518400) | `hace 6 d` |
| una fecha en el futuro (`NOW + 5000`) | `ahora` |

Para 7 días o más (7 días = 604800 s) el resultado ya no empieza por `hace`, y no lleva año. Para más de 300 días (p. ej. 301 días) debe contener un año de 4 dígitos (`/\d{4}/`). No afirmar el texto exacto de estas fechas (depende del idioma del sistema); usar `not.toMatch(/^hace/)` y regex.

**Criterios de aceptación**
- [ ] Existe `test/time.test.ts` con un `describe("relTime")` y al menos 6 `it`
- [ ] Cubre: "ahora" (incluida fecha futura), minutos, horas, días, y los dos casos de fecha corta (sin año / con año)
- [ ] No se modifica ningún archivo de `src/`
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/time.test.ts` (nuevo)

**Fuera de alcance**
- Cambiar `relTime` o su comportamiento (aunque algo parezca mejorable)
- Agregar dependencias o configuración de vitest
- Tocar otros tests

**Cómo verificar**
- `npm run typecheck && npm test` en verde
- `npm test` lista `test/time.test.ts` con todos los tests pasando

---

## #1 Tests de `normalizeUrl` y `cleanFolder`

**Contexto**
`normalizeUrl` (`src/fetch.ts`) convierte lo que el usuario pega al agregar una fuente en una URL http(s), o `null`. `cleanFolder` (`src/db.ts`) limpia los nombres de carpeta. Son funciones puras y ninguna tiene tests directos (`grep -rn "normalizeUrl\|cleanFolder" test/` no encuentra nada; `parseOpml` solo usa la primera de forma indirecta).

**Qué hay que hacer**
Crear `test/urls.test.ts` con dos `describe`. Resultados que producen hoy las funciones:

`normalizeUrl`:
- `""` y `"  "` devuelven `null`
- `"example.com/feed"` devuelve `"https://example.com/feed"` (agrega `https://`)
- `"http://a.test"` devuelve `"http://a.test/"` (respeta http)
- `"ftp://a.test"` y `"javascript:alert(1)"` devuelven `null`
- `"localhost:3000"` devuelve `"https://localhost:3000/"`
- `"https://a.test/x y"` devuelve `"https://a.test/x%20y"`

`cleanFolder`:
- `"  a   b\n c  "` devuelve `"a b c"`
- `null` y `undefined` devuelven `""`
- una cadena de 60 caracteres devuelve una de 40

**Criterios de aceptación**
- [ ] `test/urls.test.ts` existe y cubre todos los casos de la lista
- [ ] No se modifica `src/`
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/urls.test.ts` (nuevo)

**Fuera de alcance**
- Cambiar el comportamiento de las funciones o su firma
- Probar otras funciones de `db.ts` (necesitan D1)

**Cómo verificar**
- `npm run typecheck && npm test` en verde

---

## #2 Tests de casos límite de OPML

**Contexto**
`src/opml.ts` tiene un test de ida y vuelta básico en `test/auth.test.ts` y otro en `test/parse.test.ts`. No hay tests de entradas raras: anidación profunda, XML inválido, archivo sin `body`, ni de escapado de comillas y `&` al exportar.

**Qué hay que hacer**
Crear `test/opml.test.ts` (no editar los tests existentes) con estos casos, que ya se comportan así hoy:

`parseOpml`:
- Tres niveles (`A > B > feed C`): devuelve una fuente con `folder: "A"` (solo un nivel de carpeta; gana la más externa)
- `"esto no es xml"` devuelve `[]`
- `<opml><body></body></opml>` devuelve `[]`
- Un `outline` con `xmlUrl`, `title="T"` y `text="X"` usa `"T"` como título
- Un `outline` con `xmlUrl` y sin título ni texto devuelve `title: ""`
- Un `xmlUrl` con esquema `ftp://` se descarta

`buildOpml`:
- Con `[]` devuelve un XML con `<body>` vacío (contiene `<opml version="2.0">` y no contiene `<outline`)
- Un nombre `Dice "hola" <b>` se exporta como `Dice &quot;hola&quot; &lt;b&gt;`, y una URL con `?a=1&b=2` como `?a=1&amp;b=2`

**Criterios de aceptación**
- [ ] `test/opml.test.ts` cubre los 8 casos
- [ ] No se modifican `src/` ni los tests existentes
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/opml.test.ts` (nuevo)

**Fuera de alcance**
- Soportar más niveles de carpetas
- Cambiar el formato de exportación

**Cómo verificar**
- `npm run typecheck && npm test` en verde

---

## #3 Tests de `parseFeed`: RDF, tope de 100 y enlaces no válidos

**Contexto**
`parseFeed` (`src/parse.ts`) acepta RSS, Atom y RDF (rama `doc["rdf:RDF"]`), recorta a 100 entradas (`.slice(0, 100)`) y descarta enlaces que no son http(s) (función `absolute`). `test/parse.test.ts` solo prueba RSS 2.0 y Atom: la rama RDF, el tope y el descarte de enlaces no tienen tests.

**Qué hay que hacer**
Agregar un bloque `describe("parseFeed: casos límite")` al final de `test/parse.test.ts` (reutilizar la constante `NOW` y los imports existentes; ajustar el import solo si hace falta):
- RDF/RSS 1.0 con `<channel><title>R</title><link>https://r.test/</link></channel>` y un `<item>` con título `I` y enlace `https://r.test/1` (con `xmlns:rdf` y `xmlns="http://purl.org/rss/1.0/"`): `title` `"R"`, `siteUrl` `"https://r.test/"`, una entrada con `link` y `guid` `"https://r.test/1"`
- Un RSS con 150 `<item>` válidos devuelve exactamente 100 entradas
- Un `<item>` con `<link>javascript:x()</link>` y título `Solo` produce una entrada con `link: ""` y `title: "Solo"` (el título se conserva como `guid`)

**Criterios de aceptación**
- [ ] Los 3 casos están en `test/parse.test.ts` y pasan
- [ ] No se modifica `src/`
- [ ] Los tests existentes no cambian
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/parse.test.ts`

**Fuera de alcance**
- Cambiar el tope de 100 o el comportamiento de `parseFeed`
- Tocar el caso de `<item>` sin título ni enlace (comportamiento por revisar en otro issue)

**Cómo verificar**
- `npm run typecheck && npm test` en verde

---

## #4 Tests de `decodeEntities`

**Contexto**
`decodeEntities` (`src/parse.ts`, exportada) decodifica entidades HTML con nombre, decimales y hexadecimales, y deja intactas las que no reconoce. Solo se prueba de rebote dentro de `htmlToText`; no hay casos directos de entidades desconocidas ni de códigos inválidos.

**Qué hay que hacer**
Agregar un `describe("decodeEntities")` en un archivo nuevo `test/entities.test.ts` con estos resultados (ya son los actuales):
- `decodeEntities("&#233; &#x41;")` devuelve `"é A"`
- `"&#99999999;"` (código fuera de rango) se deja tal cual
- `"&foo;"` (entidad desconocida) se deja tal cual
- `"&AMP;"` devuelve `"&"` (no distingue mayúsculas)
- `"&nbsp;"` devuelve un espacio normal `" "`
- `"&hellip;&mdash;"` devuelve `"…—"`
- Un texto sin entidades se devuelve igual

**Criterios de aceptación**
- [ ] `test/entities.test.ts` cubre los 7 casos
- [ ] No se modifica `src/`
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/entities.test.ts` (nuevo)

**Fuera de alcance**
- Agregar entidades al diccionario `ENTITIES`
- Cambiar `stripHtml` o `htmlToText`

**Cómo verificar**
- `npm run typecheck && npm test` en verde

---

## #5 Tests de `refreshFeed`

**Contexto**
`refreshFeed` (`src/refresh.ts`) descarga un feed, guarda sus entradas y actualiza la fila de `feeds`; si algo falla, guarda `last_error` (máx. 200 caracteres). Es el corazón del cron y **no tiene tests**. Usa `fetchText` (que llama a `fetch` global) y un `D1Database`. `test/security.test.ts` ya muestra cómo falsear D1 (`fakeDb`) y la red (`vi.stubGlobal("fetch", ...)`).

**Qué hay que hacer**
Crear `test/refresh.test.ts` con una D1 falsa **local al archivo** (no exportar ni refactorizar `fakeDb` de `security.test.ts`) que registre cada sentencia SQL y sus argumentos (`prepare(...).bind(...).run()` y `batch([...])`), y `vi.stubGlobal("fetch", ...)` con `Response` reales. Casos, con `now` fijo pasado como tercer argumento:
- Respuesta 304: se ejecuta un `UPDATE feeds SET last_checked_at = ?, last_error = ''` con `now` y el id del feed, y no se insertan entradas
- Respuesta 200 con un RSS válido de 1 entrada: se insertan entradas (sentencia `INSERT INTO entries`) y se ejecuta el `UPDATE` con `etag` y `last_modified` de las cabeceras de la respuesta
- Respuesta 200 con HTML (no es feed): `last_error` queda en `"El contenido no es un feed válido"` y no se insertan entradas
- Respuesta 500: `last_error` es `"HTTP 500"`
- La función no lanza nunca (el `await` termina bien en todos los casos anteriores)

**Criterios de aceptación**
- [ ] `test/refresh.test.ts` cubre los 4 escenarios y comprueba las sentencias/argumentos registrados
- [ ] No hay red real: `fetch` está simulado y se restaura (`vi.unstubAllGlobals()`) en `afterEach`
- [ ] No se modifica `src/` ni `test/security.test.ts`
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/refresh.test.ts` (nuevo)

**Fuera de alcance**
- `refreshDue` y `backfillFavicons`
- Extraer una utilidad de pruebas compartida
- Cambiar `refresh.ts`

**Cómo verificar**
- `npm run typecheck && npm test` en verde

---

## #6 Tests de `discoverFeed`

**Contexto**
`discoverFeed` (`src/fetch.ts`) es lo que se ejecuta al agregar una fuente: acepta la URL de un feed o de un sitio, busca `<link rel="alternate">` en el HTML y prueba rutas comunes (`/feed`, `/rss.xml`, `/atom.xml`, `/feed.xml`, `/index.xml`, `/rss`). No tiene tests (en `test/security.test.ts` solo se prueban `fetchText` y `resolveFavicon`).

**Qué hay que hacer**
Crear `test/discover.test.ts` con `vi.stubGlobal("fetch", ...)` que responda según la URL pedida (usar `new Response(body, { status })`; `res.url` queda vacío y `fetchText` usa entonces la URL pedida). Casos:
- La URL dada ya es un feed RSS válido: devuelve ese feed (`feedUrl` igual a la URL, `parsed.entries.length` correcto)
- La URL es un HTML con `<link rel="alternate" type="application/rss+xml" href="/rss.xml">` y `/rss.xml` devuelve un feed: `feedUrl` es la URL absoluta del feed
- El HTML no declara feed, pero `/feed` (ruta común) devuelve un RSS válido: lo encuentra
- Nada responde un feed: lanza `"No encontré un feed RSS en esa dirección"`
- Entrada inválida (`""`): lanza `"La dirección no es válida"`
- La primera petición falla (rechaza con error de red): el mensaje empieza por `"No se pudo abrir la página"`

**Criterios de aceptación**
- [ ] `test/discover.test.ts` cubre los 6 casos
- [ ] Sin red real; `fetch` se restaura en `afterEach`
- [ ] No se modifica `src/`
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `test/discover.test.ts` (nuevo)

**Fuera de alcance**
- Cambiar el orden o la lista de rutas comunes
- Tocar `resolveFavicon` o los tests de `security.test.ts`

**Cómo verificar**
- `npm run typecheck && npm test` en verde

---

## #7 Mostrar los no leídos en el título de la pestaña

**Contexto**
`Layout` (`src/views/Layout.tsx`) ya calcula `unread` (suma de no leídos de las suscripciones) para el contador de "Todo", pero el `<title>` de la pestaña es siempre `{title} · Lector RSS` (componente `Head`, mismo archivo; también lo usan `Auth.tsx` y `Admin.tsx` sin contador). Hoy no se ve cuántos hay sin leer sin abrir la pestaña.

**Qué hay que hacer**
- Exportar desde `src/views/Layout.tsx` una función pura `pageTitle(title: string, unread = 0): string` que devuelva `"(N) {title} · Lector RSS"` cuando `unread > 0` y `"{title} · Lector RSS"` en caso contrario.
- `Head` usa `pageTitle` y acepta una prop opcional `unread?: number`.
- `Layout` pasa su `unread` a `Head`. Las demás páginas no cambian.
- El valor se calcula al cargar la página; no hay que actualizarlo en vivo desde `public/app.js`.

**Test que debe fallar primero**
`test/title.test.ts` con los tres casos de `pageTitle` (commit `test:`); falla porque `pageTitle` aún no existe en `src/views/Layout.tsx`. Después, el commit `feat:` con la implementación.

**Criterios de aceptación**
- [ ] `pageTitle("Todo", 12)` devuelve `"(12) Todo · Lector RSS"`
- [ ] `pageTitle("Todo", 0)` y `pageTitle("Todo")` devuelven `"Todo · Lector RSS"`
- [ ] Hay un test en `test/title.test.ts` con esos tres casos
- [ ] `Auth.tsx` y `Admin.tsx` siguen sin contador (no se modifican)
- [ ] No se agregan scripts ni estilos en línea; no se toca `public/`
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `src/views/Layout.tsx`
- `test/title.test.ts` (nuevo)

**Fuera de alcance**
- Actualizar el título en vivo al marcar leído (`public/app.js`)
- Favicon con contador, notificaciones
- Cambiar otras vistas

**Cómo verificar**
- `npm run typecheck && npm test` en verde
- Lectura del diff: solo cambian `Head`, `Layout` y el test

---

## #8 README: documentar tests, CI y la fábrica

TDD: no aplica (solo documentación).

**Contexto**
`README.md` dice `npm test  # tests (parser, OPML, contraseñas)`, pero también existen tests de seguridad (`test/security.test.ts`), y ahora el repo tiene integración continua (`.github/workflows/ci.yml`), despliegue automático (`.github/workflows/deploy.yml`) y un proceso de trabajo con el agente de Copilot (`docs/fabrica/README.md`). El árbol de la sección "Estructura" no los menciona.

**Qué hay que hacer**
Editar solo `README.md`:
- Cambiar el comentario de `npm test` a `# tests (parser, OPML, contraseñas, seguridad)`.
- Agregar al final de "Desarrollo local" una sección breve "Integración continua" (3 a 5 líneas): el job `check` corre `npm run typecheck` y `npm test` en cada PR; el merge a `master` despliega solo; las migraciones se siguen aplicando a mano con `npm run db:remote` antes del merge.
- Agregar a la lista de "Estructura": `.github/  CI, despliegue y plantillas`, y `docs/fabrica/  proceso con el agente de Copilot`, alineadas con las demás líneas.

**Criterios de aceptación**
- [ ] Solo cambia `README.md`
- [ ] El texto nuevo está en español, sin emojis
- [ ] Las líneas nuevas de "Estructura" quedan alineadas con las existentes
- [ ] No se cambia ninguna otra sección
- [ ] `npm run typecheck` y `npm test` pasan

**Archivos probables**
- `README.md`

**Fuera de alcance**
- Reescribir o reordenar otras secciones del README
- Tocar `docs/fabrica/` o los workflows

**Cómo verificar**
- Leer `git diff README.md`: solo líneas añadidas, más el comentario de `npm test`
- `npm run typecheck && npm test` en verde

---

## #9 [DIFÍCIL, PRUEBA DE LÍMITE] Vista "Sin leer"

**Contexto**
La barra lateral tiene dos vistas: "Todo" y "Guardados" (`View = "all" | "starred"` en `src/db.ts`; `parseView` en `src/index.tsx`). No existe un filtro de solo no leídos, aunque el contador "Todo" ya muestra cuántos hay. Este issue cruza varias capas (consulta SQL, ruta, vista, estilos) y sirve para ver dónde está el límite del agente. No se espera que salga a la primera.

**Qué hay que hacer**
Agregar una tercera vista `unread` accesible con `?v=unread`, igual que `?v=starred`:
- `View` pasa a `"all" | "starred" | "unread"`; `parseView` acepta `"unread"`.
- `queryEntries` (`src/db.ts`), con `view === "unread"`, devuelve solo artículos no leídos y dentro de los últimos `UNREAD_DAYS` días (la misma regla que usa el contador: `e.sort_at > horizon` y estado efectivo `READ(h) = 0`), respetando `feedId`, `folder` y paginación `before`.
- En `Layout.tsx`, un enlace "Sin leer" en la sección de vistas (junto a "Todo" y "Guardados"), con el icono ya existente que mejor encaje (no crear iconos nuevos) y el contador `unread`; marcado como activo cuando `view === "unread"`.
- En `Timeline.tsx`: título "Sin leer", y un estado vacío "Estás al día" cuando no hay artículos. "Marcar todo leído" se muestra en esta vista igual que en "Todo".
- Respetar el sistema de diseño de `public/app.css` (solo componentes existentes, sin estilos en línea).

**Test que debe fallar primero**
Un test nuevo en `test/` (commit `test:`) que comprueba que `parseView("unread")` devuelve `"unread"` (hoy cae en la vista por defecto) y que la SQL de `queryEntries` con `unread` contiene la condición de no leído y de horizonte. Después, el commit `feat:` con la implementación. La parte de UI/CSS (enlace, estado vacío) no lleva TDD.

**Criterios de aceptación**
- [ ] `GET /?v=unread` muestra solo no leídos recientes; `?v=starred` y `/` no cambian
- [ ] El enlace "Sin leer" aparece en la barra lateral y queda activo en esa vista
- [ ] Hay un test (sin D1 real) que comprueba `parseView`/la selección de vista, y otro que comprueba que la SQL generada para `unread` contiene la condición de no leído y de horizonte
- [ ] El estado vacío "Estás al día" aparece cuando no hay resultados
- [ ] No hay scripts ni estilos en línea; la CSP no cambia
- [ ] No hay migraciones nuevas
- [ ] `npm run typecheck` pasa
- [ ] `npm test` pasa

**Archivos probables**
- `src/db.ts`
- `src/index.tsx`
- `src/views/Layout.tsx`
- `src/views/Timeline.tsx`
- `test/` (un archivo nuevo)

**Fuera de alcance**
- Cambios de esquema o migraciones
- Atajos de teclado nuevos o cambios en `public/app.js`
- Ocultar artículos al marcarlos como leídos en vivo (la lista no se re-filtra sola)
- Refactorizar `queryEntries`

**Cómo verificar**
- `npm run typecheck && npm test` en verde
- Revisión humana del diff, comprobando que la condición SQL coincide con la del contador de `listSubs`
