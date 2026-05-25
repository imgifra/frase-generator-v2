# AI_CONTRACT.md — frase-generator-v2

Guía para cualquier IA (o humano) que trabaje en este repositorio.
Léela completa antes de tocar código.

---

## Qué hace este proyecto

Sistema automatizado de publicación de contenido para Instagram, Facebook y Threads.
Toma frases escritas manualmente, las renderiza como imágenes estilo retro 3D con Playwright,
las sube a Cloudinary y las publica en las tres plataformas. Corre 3 veces al día vía GitHub Actions.

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
├── js/                        Frontend del generador visual (corre en Playwright)
│   ├── app.js                 Orquesta modos; setea window.renderReady = true al terminar
│   ├── palettes.js            Paletas de color — ESPEJO de retro-palettes.js (ver abajo)
│   ├── mode-retro3d.js        Modo activo de render
│   └── utils.js               Helpers visuales (getBrightness, getContrastColor, hexToRgb...)
│
├── scripts/
│   ├── auth/                  google-auth.js — service account
│   ├── core/
│   │   ├── sheets.js          Cliente Google Sheets (readRows, updateCellsBatch)
│   │   └── status.js          Constantes: STATUS, LOCK_STATUS, POST_TIPOS, MAX_INTENTOS
│   ├── libs/
│   │   ├── graph-client.js    Base HTTP para Meta API (graphGet, graphPost — soporta arrays)
│   │   ├── instagram-lib.js   Publica en IG: containers, polling, carousels
│   │   ├── facebook-lib.js    Publica en FB: fotos + carrusels con retry
│   │   ├── threads-lib.js     Publica en Threads: image + carousel
│   │   ├── render-lib.js      Servidor HTTP local + Playwright
│   │   ├── upload-lib.js      Sube/borra en Cloudinary
│   │   └── retro-palettes.js  FUENTE DE VERDAD de las paletas (ver regla #4)
│   ├── jobs/
│   │   ├── single/            render/upload/publish/apply-plan para posts únicos
│   │   ├── carousel/          render/upload/publish/apply-plan para carruseles
│   │   └── metrics/           fetch-metrics.js — corre los domingos
│   ├── pipeline/
│   │   ├── run-once.js        Punto de entrada: decide single/carousel/auto + llama releaseStaleLocks
│   │   ├── run-single.js      Pipeline de single
│   │   ├── run-carousel.js    Pipeline de carousel
│   │   └── register-from-form.js  Escribe frases del formulario al sheet
│   ├── utils/
│   │   ├── pipeline-runner.js Ejecuta steps render→upload→publish en orden
│   │   ├── pipeline-utils.js  runStep (timeout 4min) + releaseStaleLocks
│   │   ├── carousel-utils.js  Agrupa filas del sheet por carousel_id
│   │   ├── common.js          nowIsoLocal(), colToLetter(), normalizeValue()
│   │   └── logger.js          Logger estructurado JSON
│   └── dev/
│       ├── sync-palettes.js         Fuente → frontend (CORRER después de editar paletas)
│       └── check-palettes-sync.js   Verifica sincronización (usar en CI)
│
├── data/
│   └── singles-plan.json      Plan de publicación — datos separados del código
│
└── docs/
    ├── arquitectura-proyecto.md   Mapa completo del sistema
    └── AI_CONTRACT.md             Este archivo
```

---

## El sheet de Google Sheets — columnas clave

Cada fila es un post (o un slide de carrusel).

| Columna | Valores posibles | Significado |
|---|---|---|
| `post_tipo` | `single` / `carousel` | Tipo de post |
| `estado_general` | `pending` → `processing` → `published` / `error` | Estado global |
| `estado_render` | `pending` / `processing` / `done` / `error` | Paso 1 |
| `estado_upload` | `pending` / `processing` / `done` / `error` | Paso 2 |
| `estado_publish` | `pending` / `processing` / `done` / `error` | Paso 3 |
| `lock_status` | `free` / `locked` | Mutex por fila — ver regla #1 |
| `intentos` | número | Se incrementa al tomar la fila — máximo 3 |
| `carousel_id` | string | ID compartido por todos los slides del carrusel |
| `carousel_order` | número | Posición del slide dentro del carrusel |
| `background_color` | hex (`#rrggbb`) | Color asignado al render |
| `cloudinary_url` | URL | Imagen subida — se borra después de publicar |
| `instagram_media_id` | ID | Seteado después de publicar en IG |
| `updated_at` | ISO 8601 local | Timestamp del último cambio — usado por releaseStaleLocks |

---

## Reglas críticas — no romper esto

### Regla #1 — El lock es exclusivo

Una fila con `lock_status = locked` está siendo procesada por otro ciclo.
**Solo `free` es elegible** para iniciar un nuevo paso. Nunca aceptar `locked` como elegible.

```js
// ✅ correcto
lockStatus === LOCK_STATUS.FREE

// ❌ incorrecto — causa doble procesamiento
lockStatus === LOCK_STATUS.FREE || lockStatus === LOCK_STATUS.LOCKED
```

Si un proceso falla, el `catch` siempre escribe `lock_status = free` antes de terminar.
Si el proceso es killed (timeout de GitHub Actions), `releaseStaleLocks` en `run-once.js`
libera las filas bloqueadas al inicio del siguiente ciclo.

### Regla #2 — `releaseStaleLocks` siempre al inicio del ciclo

`run-once.js` llama `releaseStaleLocks({ cycleId })` antes de cualquier pipeline.
Si agregas un nuevo punto de entrada al sistema, también debe llamarlo.

### Regla #3 — Siempre usar el logger estructurado

En cualquier script bajo `scripts/`, usar `logger.info / logger.warn / logger.error`.
**Nunca `console.log` o `console.error`** — el logger agrega `cycleId`, `job` y timestamp
que hacen los logs de GitHub Actions buscables.

```js
// ✅
const { logger } = require("../utils/logger");
logger.info("Subiendo imagen", { fileName, cloudinaryUrl });

// ❌
console.log("Subiendo imagen:", fileName);
```

### Regla #4 — Las paletas tienen una única fuente de verdad

`scripts/libs/retro-palettes.js` es la fuente de verdad.
`js/palettes.js` es un espejo generado — **no editar a mano**.

Si modificás, agregás o eliminás una paleta:
1. Editar `retro-palettes.js`
2. Correr `npm run sync-palettes`
3. Verificar con `node scripts/dev/check-palettes-sync.js`

### Regla #5 — Los datos van en `data/`, no en el código

Arrays de contenido (planes de publicación, listas de captions, etc.) van en `data/*.json`.
Los scripts los leen con `require("../../data/archivo.json")`.
No hardcodear arrays de datos dentro de scripts.

### Regla #6 — `graphPost` centralizado en `graph-client.js`

Toda llamada a la Meta Graph API pasa por `graphGet` o `graphPost` de `graph-client.js`.
`facebook-lib.js` y el resto importan esas funciones — no reimplementan su propia versión HTTP.
`graphPost` ya soporta valores array (para `attached_media[0]`, etc.).

### Regla #7 — `stopServer` en `render-lib.js`

El singleton del servidor se limpia **antes** de llamar `close()`.
Si `close()` falla, el próximo `ensureServer()` puede arrancar uno nuevo sin conflicto.
No invertir este orden.

---

## Patrones de código a seguir

### Leer y escribir el sheet

```js
const sheets = await getSheetsClient();
const rows   = await readRows(sheets);
const hm     = buildHeaderMap(rows[0]);
requireHeaders(hm, ["frase_original", "estado_general", "lock_status"]);

const valor = getCellValue(rows[i], hm, "frase_original");

await updateCellsBatch(sheets, [
  { row: 5, col: hm["estado_general"] + 1, value: "done" },
  { row: 5, col: hm["lock_status"] + 1,    value: "free" }
]);
```

### Tomar una fila con lock

El patrón estándar es: leer elegibles → escribir `locked` y `processing` en batch atómico → procesar → liberar en `finally`.

Ver `upload-single-from-sheet.js` como referencia completa.

### Agregar un nuevo modo de render

1. Crear `js/mode-nuevo.js` con la función de dibujo
2. Registrarlo en `js/app.js` en el switch de modos
3. Playwright lo toma automáticamente via `?mode=nuevo` en la URL
4. Probar localmente con `npm run render-preview`

---

## Variables de entorno requeridas

| Variable | Dónde se usa |
|---|---|
| `SHEET_ID` | ID del Google Sheet |
| `WORKSHEET_NAME` | Nombre de la hoja activa |
| `SERVICE_ACCOUNT_JSON` | Credenciales de Google (base64 o JSON string) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary |
| `CLOUDINARY_API_KEY` | Cloudinary |
| `CLOUDINARY_API_SECRET` | Cloudinary |
| `IG_USER_ID` | Instagram User ID |
| `IG_ACCESS_TOKEN` | Token permanente de Instagram |
| `FB_PAGE_ID` | Facebook Page ID |
| `FB_PAGE_ACCESS_TOKEN` | Token permanente de Facebook |
| `THREADS_USER_ID` | Threads User ID |
| `THREADS_ACCESS_TOKEN` | Token permanente de Threads |
| `GRAPH_API_VERSION` | Versión de la API (ej. `v25.0`) |

---

## Lo que no existe (no inventar)

- No hay base de datos — el estado está 100% en Google Sheets
- No hay servidor permanente — GitHub Actions levanta y baja todo por ciclo
- No hay autenticación web — `publicar.html` es estático en GitHub Pages
- No hay cola de mensajes — el pipeline es síncrono y secuencial por diseño
- `mode-brat.js` y `mode-normal.js` existen pero **no están activos en producción**

---

## Antes de proponer un cambio

1. **¿Toca el lock o la elegibilidad de filas?** → Revisar regla #1 y testear con dos ciclos paralelos.
2. **¿Toca las paletas?** → Usar `sync-palettes` y `check-palettes-sync`.
3. **¿Agrega datos hardcodeados en un script?** → Moverlos a `data/*.json`.
4. **¿Agrega logging?** → Usar el logger, no `console`.
5. **¿Agrega un nuevo punto de entrada al pipeline?** → Llamar `releaseStaleLocks` al inicio.
6. **¿Toca `stopServer` o el singleton del servidor?** → Limpiar el singleton antes de `close()`.