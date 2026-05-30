# AI_CONTRACT.md — frase-generator-v2

Guía para cualquier IA (o humano) que trabaje en este repositorio.
Léela completa antes de tocar código.

---

## Qué hace este proyecto

Sistema automatizado de publicación de contenido para Instagram, Facebook y Threads.
Toma frases escritas manualmente, las renderiza como imágenes estilo retro 3D con Playwright,
las sube a Cloudinary y las publica en las tres plataformas. Corre 2 veces al día vía GitHub Actions.

También tiene un flujo secundario de curaduría ("Archivo X") para importar frases desde tweets
guardados, revisarlas manualmente y armarlas en carruseles.

**Stack:** Node.js · Google Sheets (estado) · Cloudinary (imágenes) · Meta Graph API · Playwright

---

## Arquitectura en una línea

```
publicar.html → GitHub Actions → register → render → upload → publish → métricas
```

Cada flecha es un script independiente. El estado viaja a través de Google Sheets.

---

## Estructura del repo

```
/
├── index.html                 Generador visual — lo abre Playwright para hacer screenshots
├── publicar.html              Formulario de publicación (GitHub Pages) — dispara el workflow
│
├── js/                        Frontend del generador visual (corre en Playwright/browser)
│   ├── app.js                 Orquesta modos; setea window.renderReady = true al terminar
│   ├── config.js              Constantes del canvas y configuración visual
│   ├── palettes.js            Paletas de color — ESPEJO de retro-palettes.js (ver Regla #4)
│   ├── mode-retro3d.js        Modo activo de render (el único que se usa en producción)
│   ├── mode-brat.js           Modo legacy (no se usa en producción)
│   ├── mode-normal.js         Modo básico
│   ├── branding.js            Logo y marca de agua
│   └── utils.js               Helpers visuales (getBrightness, getContrastColor, hexToRgb…)
│
├── assets/                    Fuentes y logos usados por el generador visual
│
├── scripts/
│   ├── auth/
│   │   └── google-auth.js     Service account para Google Sheets
│   ├── core/
│   │   ├── sheets.js          Cliente Google Sheets (readRows, updateCellsBatch)
│   │   └── status.js          Constantes: STATUS, LOCK_STATUS, POST_TIPOS, MAX_INTENTOS
│   ├── libs/
│   │   ├── graph-client.js    Base HTTP para Meta API (graphGet, graphPost)
│   │   ├── instagram-lib.js   Publica en IG: containers, polling, carousels
│   │   ├── facebook-lib.js    Publica en FB: fotos + carrusels con retry
│   │   ├── threads-lib.js     Publica en Threads: image + carousel, con retry automático
│   │   ├── render-lib.js      Servidor HTTP local + Playwright (maneja SIGTERM/SIGINT)
│   │   ├── upload-lib.js      Sube/borra en Cloudinary
│   │   ├── telegram-lib.js    Notificaciones al bot de Telegram (incluye errores por plataforma)
│   │   └── retro-palettes.js  FUENTE DE VERDAD de las paletas (ver Regla #4)
│   ├── pipeline/
│   │   ├── run-once.js        Punto de entrada: decide single/carousel/auto/publish-only
│   │   ├── run-single.js      Pipeline de single
│   │   ├── run-carousel.js    Pipeline de carousel
│   │   ├── register-from-form.js  Escribe frases del formulario al sheet
│   │   └── unlock-row.js      Desbloquea manualmente una fila atascada
│   ├── jobs/
│   │   ├── single/            render / upload / publish para posts únicos
│   │   ├── carousel/          render / upload / publish / build-carousel-plan para carruseles
│   │   ├── inspiration/       Flujo Archivo X: fetch, import, curate, taxonomy
│   │   └── metrics/           fetch-metrics.js — corre los domingos
│   ├── utils/
│   │   ├── pipeline-runner.js Ejecuta steps render→upload→publish en orden
│   │   ├── pipeline-utils.js  runStep (timeout 4min) + releaseStaleLocks + buildStepEnv
│   │   ├── carousel-utils.js  Agrupa filas del sheet por carousel_id
│   │   ├── common.js          nowIsoLocal(), colToLetter(), normalizeValue()
│   │   ├── render-utils.js    Helpers de render compartidos
│   │   └── logger.js          Logger estructurado JSON
│   └── dev/                   Herramientas locales — nunca corren en producción
│       ├── render-preview.js        Renderiza una frase desde CLI para probar visualmente
│       ├── render-all-retro-colors.js  Genera un PNG por cada paleta para revisar colores
│       ├── sync-palettes.js         Fuente → frontend (CORRER después de editar paletas)
│       ├── check-palettes-sync.js   Verifica sincronización (se puede usar en CI)
│       ├── archive-curator-server.js  Servidor local de curaduría (puerto 5177)
│       ├── doctor.js                Auditoría del entorno y configuración
│       └── doctor-sheet.js          Auditoría del estado del Google Sheet
│
├── tools/
│   └── archivo-x-curator.html  Interfaz web de curaduría manual (se sirve con archive-curator-server.js)
│
├── data/                      Archivos de datos separados del código
│   └── tweets-guardados-x.txt  Fuente de entrada para import:saved-tweets
│
├── docs/
│   ├── AI_CONTRACT.md             Este archivo
│   ├── arquitectura-proyecto.md   Mapa completo del sistema
│   ├── flujo-manual-archivo-x.md  Guía del flujo de curaduría Archivo X
│   └── taxonomia-grupos.md        Los 20 grupos válidos para grupo_carrusel
│
└── .github/workflows/
    ├── publish.yml            Workflow principal (schedule + workflow_dispatch)
    └── metrics.yml            Workflow de métricas (domingos)
```

---

## Sobre `publicar.html` y el generador visual

**Importante:** `publicar.html` tiene una copia inline del código de render (de `js/mode-retro3d.js`,
`js/palettes.js`, etc.) para mostrar un preview sin depender del servidor. Esta copia **no es
la fuente de verdad** — es solo una aproximación visual para el usuario.

El render real que se sube a Instagram lo hace `render-lib.js` usando Playwright sobre `index.html`,
que sí carga los archivos de `js/` directamente. Si cambiás algo en `js/mode-retro3d.js`, el
resultado real cambia pero el preview de `publicar.html` no se actualiza automáticamente.

---

## El sheet de Google Sheets — columnas clave

Cada fila es un post (o un slide de carrusel).

| Columna | Valores posibles | Significado |
|---|---|---|
| `row_id` | UUID (`crypto.randomUUID()`) | **Identificador único e inmutable de la fila** |
| `post_tipo` | `single` / `carousel` | Tipo de post |
| `estado_general` | `pending` → `processing` → `published` / `error` | Estado global |
| `estado_render` | `pending` / `processing` / `done` / `error` | Paso 1 |
| `estado_upload` | `pending` / `processing` / `done` / `error` | Paso 2 |
| `estado_publish` | `pending` / `processing` / `done` / `error` | Paso 3 |
| `lock_status` | `free` / `locked` | Mutex por fila — ver Regla #1 |
| `intentos` | número | Se incrementa al tomar la fila — máximo 3 |
| `error_step` | string | Último paso que falló (`render`, `upload`, `publish`) |
| `error_message` | string | Mensaje del último error global |
| `instagram_error` | string | Error específico de Instagram en el último intento |
| `facebook_error` | string | Error específico de Facebook en el último intento |
| `threads_error` | string | Error específico de Threads en el último intento |
| `carousel_id` | string | ID compartido por todos los slides del carrusel (`car_` + 12 chars) |
| `carousel_order` | número | Posición del slide dentro del carrusel |
| `background_color` | hex (`#rrggbb`) | Color asignado al render |
| `media_url` | URL | Imagen subida a Cloudinary — se usa para publicar |
| `cloudinary_public_id` | string | ID del asset en Cloudinary — se borra después de publicar |
| `instagram_media_id` | ID | Seteado después de publicar en IG |
| `updated_at` | ISO 8601 local | Timestamp del último cambio — usado por releaseStaleLocks |

### Sobre `row_id`

Generado con `crypto.randomUUID()` en `register-from-form.js`. Estable e inmune a
reordenamientos del sheet. Nunca usar el número de fila como ID.
Se usa en el modo `publish-only` y en `unlock-row.js` para encontrar la fila exacta.

### Sobre `instagram_error` / `facebook_error` / `threads_error`

Columnas opcionales. Si no existen en el sheet, el pipeline las ignora.
Se escriben individualmente y se limpian al inicio de cada intento.
`run-once.js` las incluye en la notificación de Telegram después de un fallo.

---

## Reglas críticas — no romper esto

### Regla #1 — El lock es exclusivo

Una fila con `lock_status = locked` está siendo procesada. **Solo `free` es elegible.**

```js
// ✅ correcto
lockStatus === LOCK_STATUS.FREE

// ❌ incorrecto — causa doble procesamiento
lockStatus === LOCK_STATUS.FREE || lockStatus === LOCK_STATUS.LOCKED
```

Si un proceso falla, el `catch` siempre escribe `lock_status = free` antes de terminar.
Si el proceso es killed, `releaseStaleLocks` en `run-once.js` libera las filas al inicio
del siguiente ciclo. Para desbloqueo manual inmediato, usar `unlock_id` en `publish.yml`.

### Regla #2 — `releaseStaleLocks` siempre al inicio del ciclo

`run-once.js` llama `releaseStaleLocks({ cycleId })` antes de cualquier pipeline.
Si agregás un nuevo punto de entrada, también debe llamarlo.
**Excepción:** `publish-only` y `unlock-row.js` lo omiten intencionalmente.

### Regla #3 — Siempre usar el logger estructurado

En cualquier script bajo `scripts/`, usar `logger.info / logger.warn / logger.error`.
Nunca `console.log` — no aparece en los logs estructurados de GitHub Actions.

```js
// ✅ correcto
const { logger } = require("../utils/logger");
logger.info("Procesando fila", { rowId, cycleId });

// ❌ incorrecto
console.log("Procesando fila", rowId);
```

### Regla #4 — Las paletas tienen una sola fuente de verdad

`scripts/libs/retro-palettes.js` es la fuente. `js/palettes.js` es un espejo generado.
**Nunca editar `js/palettes.js` a mano.** Después de cambiar `retro-palettes.js`:

```bash
npm run sync-palettes
```

Para verificar sincronización:

```bash
npm run check-palettes-sync
```

**Nota:** `publicar.html` tiene una tercera copia hardcodeada para el preview. Si cambiás
paletas, también hay que actualizarla manualmente o con `npm run sync-palettes` si el script
la contempla.

### Regla #5 — Los IDs de fila son UUIDs, nunca números de fila

`row_id` se genera con `crypto.randomUUID()`. El número de fila del sheet es mutable.

---

## Inputs del workflow `publish.yml`

| Input | Cuándo usarlo |
|---|---|
| `frases` | Frases nuevas desde el formulario (separadas por `\|\|`) |
| `caption` | Caption del post |
| `tipo` | `carousel` / `single` |
| `color` | Color hex del fondo (vacío = aleatorio) |
| `solo_registrar` | `true` = guardar en sheet sin publicar |
| `reintentar` | `true` = reintentar posts con `estado_general = error` |
| `publish_only` | `row_id` o `carousel_id` — publica sin re-renderizar ni re-subir |
| `unlock_id` | `row_id` o `carousel_id` — desbloquea una fila atascada inmediatamente |

---

## Scripts disponibles (`npm run`)

| Comando | Qué hace |
|---|---|
| `render` | Renderiza una frase desde CLI (`scripts/dev/render-preview.js`) |
| `render:single` | Corre render-single-from-sheet.js |
| `render:carousel` | Corre render-carousel-from-sheet.js |
| `upload:single` | Corre upload-single-from-sheet.js |
| `upload:carousel` | Corre upload-carousel-from-sheet.js |
| `publish:single` | Corre publish-single-from-sheet.js |
| `publish:carousel` | Corre publish-carousel-from-sheet.js |
| `build:carousel-plan` | Genera plan de carruseles desde Archivo X aprobado |
| `sync-palettes` | Sincroniza retro-palettes.js → js/palettes.js |
| `check-palettes-sync` | Verifica que palettes.js está al día |
| `doctor` | Auditoría del entorno y configuración |
| `doctor:sheet` | Auditoría del estado del Google Sheet |
| `fetch:inspiration` | Fetch de inspiración desde X/Bluesky |
| `import:saved-tweets` | Importa tweets guardados a archivo_x en el sheet |
| `curate:archivo-x` | Levanta servidor de curaduría en puerto 5177 |

---

## Flujo Archivo X (curaduría)

Flujo secundario para construir carruseles a partir de material externo.

```
data/tweets-guardados-x.txt
  ↓ npm run import:saved-tweets
archivo_x (pestaña del sheet) — decision_editorial = pendiente
  ↓ npm run curate:archivo-x  (http://localhost:5177)
archivo_x — decision_editorial = aprobada + grupo_carrusel asignado
  ↓ npm run build:carousel-plan
output/carousel-plan.json + pestaña plan_carruseles en el sheet
```

Ver `docs/flujo-manual-archivo-x.md` para detalle completo.

---

## Checklist antes de enviar un cambio

1. **¿Usaste `logger` en lugar de `console.*`?**
2. **¿El lock se libera en el `catch`?** (si tocaste un script que escribe `locked`)
3. **¿Editaste `retro-palettes.js`?** → correr `npm run sync-palettes`
4. **¿Agregaste una columna nueva al sheet?** → documentarla aquí y en `arquitectura-proyecto.md`
5. **¿El nuevo código genera IDs?** → usar `crypto.randomUUID()`, nunca `Date.now()` solo
6. **¿Creaste un nuevo punto de entrada al pipeline?** → llamar `releaseStaleLocks` al inicio
7. **¿Tocaste pipeline, docs o paletas?** → correr `npm run doctor`
8. **¿Tocaste `js/mode-retro3d.js`?** → el preview de `publicar.html` no se actualiza solo;
   evaluar si vale actualizarlo manualmente

---

## Casos de uso operativos frecuentes

### Una fila quedó bloqueada (lock_status = locked)

Opción A — esperar: `releaseStaleLocks` la libera automáticamente al inicio del siguiente ciclo
(si lleva más de 10 minutos bloqueada).

Opción B — inmediato: GitHub Actions → `publish.yml` → Run workflow → campo `unlock_id` → pegar
el `row_id` o `carousel_id`.

### Un post falló en publish pero ya tiene la imagen subida

GitHub Actions → `publish.yml` → Run workflow → campo `publish_only` → pegar el `row_id` o
`carousel_id`. Saltea render y upload, va directo a publicar.

### Quiero guardar frases sin publicar ahora

En `publicar.html`, activar "Solo guardar". O en GitHub Actions, usar `solo_registrar: true`.

### Quiero ver cómo queda una frase antes de publicar

```bash
npm run render "tu frase acá"
```

Guarda el PNG en `/output`. Es el render real (Playwright), no el preview del formulario.

### Ver qué plataforma falló exactamente

La notificación de Telegram incluye el bloque "Error por plataforma" con el mensaje específico
de cada red. También están en las columnas `instagram_error`, `facebook_error`, `threads_error`
del sheet.

---

## Preguntas frecuentes para la IA

1. **¿Dónde está el estado del sistema?** → Google Sheets, columnas `estado_*` y `lock_status`
2. **¿Cómo se evita el doble procesamiento?** → `lock_status = locked` mientras se procesa
3. **¿Cómo se comunica un step con el siguiente?** → A través del sheet
4. **¿Por qué hay `runStep` en lugar de llamadas directas?** → Ejecuta cada script como proceso
   hijo con timeout de 4 minutos, aislando fallos
5. **¿Dónde se generan los IDs de fila?** → `register-from-form.js` con `crypto.randomUUID()`
6. **¿Cómo funciona el retry automático?** → `threads-lib.js` y `facebook-lib.js` tienen
   `withRetry` para errores transitorios (HTTP 5xx, código 1)
7. **¿Por qué `publish-only` y `unlock-row` no llaman `releaseStaleLocks`?** → Son operaciones
   puntuales sobre una fila conocida
8. **¿El preview de `publicar.html` es fiel al render real?** → No exactamente. Es una copia
   inline aproximada. El render real usa `js/mode-retro3d.js` vía Playwright sobre `index.html`
9. **¿Qué es `scripts/archive-x/`?** → Carpeta legacy con versiones anteriores de scripts que
   fueron migrados a `scripts/jobs/carousel/` y `scripts/jobs/inspiration/`. No usar.