# Fábrica de software, fase 1

Proceso para que issues pequeños se conviertan en PRs hechos por el agente de nube de GitHub Copilot, con CI automático, revisión humana y despliegue al hacer merge.

## El flujo

```
issue (plantilla) ──> asignar a Copilot ──> PR del agente ──> CI `check` ──> revisión humana ──> merge a master ──> deploy
   humano                  humano               agente            GitHub           humano                            GitHub
```

1. **Issue.** La persona crea un issue con la plantilla (`feature` o `bug`). Debe ser pequeño y verificable. Los candidatos listados están en [`backlog.md`](backlog.md).
2. **Asignación.** Se asigna el issue a **Copilot**. El agente lee `.github/copilot-instructions.md`, prepara su entorno con `.github/workflows/copilot-setup-steps.yml`, trabaja en una rama `copilot/...` y abre un PR (borrador).
3. **TDD.** Bugs y funcionalidades con lógica llevan primero un commit `test:` con tests que fallan y después el commit `feat:`/`fix:` que los pasa (sin squash); el PR cita el fallo original. No aplica a UI/CSS, docs ni issues solo de tests ("TDD: no aplica (motivo)"). Detalle en `.github/copilot-instructions.md`.
4. **Verificación del agente.** Antes de abrir el PR debe haber corrido `npm run typecheck` y `npm test` (lo exigen las instrucciones).
5. **CI.** `.github/workflows/ci.yml` corre el job `check` (typecheck + test). Los workflows de un PR del agente pueden requerir que un humano pulse "Approve and run workflows".
6. **Revisión.** La persona lee el diff contra los criterios de aceptación del issue. Cambios pedidos como comentarios en el PR (cada ronda cuesta créditos, ver abajo).
7. **Merge.** Con `check` verde y 1 aprobación. Si el PR agrega una migración, **aplicarla antes** (`npm run db:remote`).
8. **Deploy.** `.github/workflows/deploy.yml` corre al hacer push a master: repite typecheck y test y ejecuta `npm run deploy`.

Regla de oro: el agente y la CI **nunca** aplican migraciones remotas. Eso siempre es manual.

## Configuración manual (una sola vez)

Pasos para la persona dueña del repositorio. Nada de esto lo puede hacer el agente.

1. **Activar el agente de nube de Copilot** para el repositorio: Settings del repo > Copilot > Cloud agent (o en la configuración de Copilot de la cuenta, habilitar el repositorio). Comprobar que en un issue aparece "Copilot" entre los asignables.
2. **Secretos de Actions** (Settings > Secrets and variables > Actions, preferible en el entorno `production`):
   - `CLOUDFLARE_API_TOKEN`: token de Cloudflare con permisos **Workers Scripts: Edit** y **D1: Edit** (a nivel de cuenta). Crearlo en dash.cloudflare.com > My Profile > API Tokens.
   - `CLOUDFLARE_ACCOUNT_ID`: id de la cuenta (en el panel de Workers, barra lateral).
3. **Entorno `production`** (Settings > Environments > New environment). Opcional: agregar "Required reviewers" para aprobar cada despliegue.
4. **Protección de master** (Settings > Rules > Rulesets, o Branches > Branch protection):
   - Requerir pull request antes de hacer merge, con **1 aprobación**.
   - Requerir el estado `check` (el job de `ci.yml`) y que la rama esté al día.
   - Bloquear force-push y borrado.
5. **Etiquetas**: crear `feature`, `bug`, `copilot` y `calibracion`.
6. **Probar el entorno del agente**: Actions > "Copilot Setup Steps" > Run workflow. Debe terminar en verde. Si falla, el agente trabajará sin dependencias y gastará créditos en vano.
7. **Probar el despliegue**: Actions > Deploy > Run workflow, una vez, con la rama master.

## Presupuesto de créditos (200 al mes)

Copilot Student da unos 200 créditos de IA al mes. Cada PR del agente y cada ronda de correcciones gasta créditos, y los issues ambiguos o grandes gastan más.

**Calibración primero.** Antes de planificar nada, ejecutar **un solo issue** (el #0 del backlog, `calibracion`) y medir cuántos créditos costó en github.com/settings/copilot (consumo antes y después). Ese número es la unidad: `créditos_por_issue_pequeño`.

**Reparto sugerido** del mes:

| Parte | % | Créditos | Uso |
|---|---|---|---|
| Trabajo nuevo | 60 % | ~120 | Primer intento de issues pequeños |
| Correcciones | 25 % | ~50 | Rondas de comentarios en PRs |
| Reserva | 15 % | ~30 | Imprevistos, un issue difícil, reintentos |

Issues del mes posibles ≈ `120 / créditos_por_issue_pequeño`. Recalcular tras los primeros tres.

**Reglas para no desperdiciar créditos:**

- Un issue = un PR pequeño. Si necesita más de ~5 archivos, dividirlo.
- Criterios de aceptación verificables y archivos probables siempre rellenados; "Fuera de alcance" explícito.
- Máximo **2 rondas de corrección** por PR. Si tras la segunda sigue mal: **cerrar el PR** y **reescribir el issue** con lo aprendido (qué entendió mal el agente) en lugar de seguir comentando.
- Si el cambio pendiente es trivial (una línea, un nombre), corregirlo a mano; es gratis.
- No asignar issues en paralelo hasta tener la calibración.
- Revisar el diff con cuidado antes de pedir cambios: juntar todos los comentarios en una sola ronda.

## Métricas

Una fila por issue entregado, en una hoja o en este mismo archivo:

| Issue | Tipo | Créditos | Rondas | CI verde al 1er intento | Mergeado sin código humano | TDD respetado | Regresión |
|---|---|---|---|---|---|---|---|
| #0 relTime | test | | | | | | |
| | | | | | | | |

- **Tipo:** `test`, `feature`, `bug`, `docs`, `dificil`.
- **Créditos:** consumo medido en github.com/settings/copilot (antes y después).
- **Rondas:** rondas de corrección pedidas tras el primer PR (0 = aceptado a la primera).
- **CI verde al 1er intento:** el `check` del primer commit del agente pasó.
- **Mergeado sin código humano:** nadie escribió código a mano en el PR (los comentarios no cuentan).
- **TDD respetado:** hay un commit `test:` previo con el fallo citado en el PR, o el PR declara "TDD: no aplica (motivo)" con un motivo válido (sí/no/n.a.).
- **Regresión:** algo roto en producción atribuible al PR (sí/no, y cuál).

## Criterio de éxito para pasar a la fase 2

Pasar a la fase 2 (más automatización: p. ej. asignación por etiquetas, revisión asistida) cuando, sobre al menos 8 issues pequeños:

- **≥ 70 %** se mergean **sin código humano**, y
- **cero regresiones** en producción.

Si no se cumple, ajustar primero los issues y `.github/copilot-instructions.md`, no automatizar más.
