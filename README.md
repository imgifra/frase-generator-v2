# frase-generator-v2

Sistema automatizado de publicación de contenido para Instagram, Facebook y Threads. Toma frases ingresadas vía formulario web, las renderiza como imágenes con estilo retro 3D, las sube a Cloudinary y las publica en las tres redes. Corre automáticamente dos veces al día vía GitHub Actions.

---

## Cómo funciona

```
ENTRADA          PIPELINE              SERVICIOS EXTERNOS
─────────        ─────────             ──────────────────
formulario  ──►  render                Google Sheets (estado)
  web            upload                Cloudinary (imágenes)
  (GitHub        publish               Instagram API
  Actions)       métricas              Facebook API / Threads
```

1. Escribís una frase en `publicar.html` (GitHub Pages)
2. El formulario dispara el workflow `publish.yml` en GitHub Actions
3. El pipeline renderiza → sube → publica
4. El estado de cada post vive en Google Sheets
5. Los domingos, `metrics.yml` trae métricas de los últimos 30 días

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/arquitectura-proyecto.md`](docs/arquitectura-proyecto.md) | Mapa completo del sistema: cada archivo, cada capa, el modelo de datos en Sheets |
| [`docs/orden para ejecucion.txt`](docs/orden%20para%20ejecucion.txt) | Comandos para correr el pipeline localmente en desarrollo |
| [`docs/Qué hacer en el futuro.txt`](docs/Qué%20hacer%20en%20el%20futuro.txt) | Roadmap e ideas pendientes |

---

## Scripts disponibles

```bash
# Pipeline completo (auto: carousel primero, cae a single si no hay)
node scripts/pipeline/run-once.js

# Solo un tipo
TIPO_INPUT=carousel node scripts/pipeline/run-once.js
TIPO_INPUT=single   node scripts/pipeline/run-once.js

# Jobs individuales
npm run render:single
npm run render:carousel
npm run upload:single
npm run upload:carousel
npm run publish:single
npm run publish:carousel

# Desarrollo
npm run render                        # preview rápido de una frase
node scripts/dev/render-all-retro-colors.js  # previsualiza las 25 paletas

# Sincronizar paletas (después de editar retro-palettes.js)
npm run sync-palettes
```

---

## Estructura

```
.github/workflows/
  publish.yml          # pipeline principal (2x día)
  metrics.yml          # métricas semanales (domingos)

js/                    # generador visual (frontend / Playwright)
scripts/
  core/                # sheets.js, status.js
  libs/                # graph-client, instagram, facebook, threads, cloudinary, render
  jobs/                # render, upload, publish — carousel y single
  pipeline/            # run-once, run-carousel, run-single, register-from-form
  utils/               # logger, common, carousel-utils, render-utils, pipeline-runner
  dev/                 # herramientas locales (preview, sync-palettes)

docs/                  # arquitectura, ejecución local, roadmap
index.html             # generador visual (sirve Playwright para los screenshots)
publicar.html          # formulario de publicación (GitHub Pages)
```

---

## Secrets requeridos en GitHub

| Secret | Para qué |
|---|---|
| `SHEET_ID` | ID del Google Sheet de estado |
| `WORKSHEET_NAME` | Nombre de la hoja dentro del sheet |
| `SERVICE_ACCOUNT_JSON` | Credenciales de la cuenta de servicio de Google |
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | Subida de imágenes |
| `IG_USER_ID` / `IG_ACCESS_TOKEN` | Publicación en Instagram |
| `FB_PAGE_ID` / `FB_PAGE_ACCESS_TOKEN` | Publicación en Facebook |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | Publicación en Threads |
| `GRAPH_API_VERSION` | Versión de la Graph API de Meta |
| `GENERATOR_URL` / `GENERATOR_PORT` | URL del servidor de render local en Actions |