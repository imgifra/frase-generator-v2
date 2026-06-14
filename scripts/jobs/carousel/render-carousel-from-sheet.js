require("dotenv").config();

const { renderPhrase } = require("../../libs/render-lib");
const {
  getSheetsClient,
  buildHeaderMap,
  requireHeaders,
  getCellValue,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");
const { nowIsoLocal } = require("../../utils/common");
const { logger } = require("../../utils/logger");
const {
  STATUS,
  GENERAL_STATUS,
  POST_TIPOS,
  LOCK_STATUS,
  MAX_INTENTOS
} = require("../../core/status");
const {
  getPendingCarouselRows,
  validateCarouselRows,
  markCarouselGroupAsError
} = require("../../utils/carousel-utils");
const {
  runRenderJob,
  buildProcessingUpdates,
  buildRenderedUpdates,
  resolveBackgroundColor,
  extractPhraseFields
} = require("../../utils/render-job-utils");

function hasCarouselAwaitingPublish(rows, headerMap) {
  const seenCarousels = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const postTipo = getCellValue(row, headerMap, "post_tipo").toLowerCase();
    if (postTipo !== POST_TIPOS.CAROUSEL) continue;

    const carouselId = getCellValue(row, headerMap, "carousel_id");
    if (!carouselId) continue;

    const estadoUpload  = getCellValue(row, headerMap, "estado_upload").toLowerCase();
    const estadoPublish = getCellValue(row, headerMap, "estado_publish").toLowerCase();

    if (!seenCarousels.has(carouselId)) {
      seenCarousels.set(carouselId, {
        hasUploadDone:    false,
        hasPublishPending: false
      });
    }

    const entry = seenCarousels.get(carouselId);

    if (estadoUpload === STATUS.DONE) {
      entry.hasUploadDone = true;
    }

    if (estadoPublish === STATUS.PENDING || estadoPublish === STATUS.ERROR) {
      entry.hasPublishPending = true;
    }
  }

  for (const [, entry] of seenCarousels) {
    if (entry.hasUploadDone && entry.hasPublishPending) {
      return true;
    }
  }

  return false;
}

async function markCarouselAsProcessing({ sheets, headerMap, groupRows, cycleId }) {
  const lockTs = nowIsoLocal();
  const lockUpdates = [];

  for (const item of groupRows) {
    lockUpdates.push(...buildProcessingUpdates(headerMap, item.rowNumber, cycleId, lockTs));
  }

  await updateCellsBatch(sheets, lockUpdates);
}

async function markSlideAsRendered({ sheets, headerMap, rowNumber, carouselBg, fileName }) {
  const doneTs = nowIsoLocal();

  await updateCellsBatch(sheets, buildRenderedUpdates(headerMap, rowNumber, carouselBg, fileName, doneTs));
}

async function main() {
  const cycleId = process.env.PIPELINE_CYCLE_ID || "";

  const log = logger.child({
    job: "render-carousel",
    cycleId
  });

  const sheets = await getSheetsClient();
  const rows   = await readRows(sheets);

  if (rows.length < 2) {
    log.info("No hay datos en la hoja");
    return;
  }

  const headers   = rows[0];
  const headerMap = buildHeaderMap(headers);

  const requiredHeaders = [
    "row_id",
    "updated_at",
    "frase_original",
    "frase_corregida",
    "modo",
    "background_color",
    "estado_general",
    "estado_render",
    "estado_upload",
    "estado_publish",
    "lock_status",
    "intentos",
    "last_cycle_id",
    "error_step",
    "error_message",
    "output_file",
    "fecha_generado",
    "fecha_publicado",
    "post_tipo",
    "carousel_id",
    "carousel_order"
  ];

  requireHeaders(headerMap, requiredHeaders);

  if (hasCarouselAwaitingPublish(rows, headerMap)) {
    log.info("Hay un carrusel con upload completo pendiente de publicar. No se inicia nuevo render.", {
      blocked: true
    });

    process.exit(10);
  }

  const { selectedCarouselId, groupRows } = getPendingCarouselRows(
    rows,
    headerMap,
    (row, hm) => {
      const estadoRender = getCellValue(row, hm, "estado_render").toLowerCase();
      const lockStatus   = getCellValue(row, hm, "lock_status").toLowerCase();
      const intentos     = Number(getCellValue(row, hm, "intentos") || 0);

      return (
        (estadoRender === STATUS.PENDING || estadoRender === STATUS.ERROR) &&
        lockStatus === LOCK_STATUS.FREE &&
        intentos < MAX_INTENTOS
      );
    }
  );

  if (!selectedCarouselId) {
    log.info("No hay carruseles pendientes para render");
    process.exit(10);
  }

  validateCarouselRows(groupRows, selectedCarouselId);

  const groupLogger = log.child({
    carouselId: selectedCarouselId,
    slides: groupRows.length
  });

  groupLogger.info("Carrusel seleccionado para render");

  const carouselBg = resolveBackgroundColor(groupRows[0].values, rows, headerMap);

  try {
    await markCarouselAsProcessing({ sheets, headerMap, groupRows, cycleId });

    for (const item of groupRows) {
      const rowNumber = item.rowNumber;
      const row       = item.values;

      const { rowId, mode, textToRender } = extractPhraseFields(row, headerMap);
      const estadoRenderOriginal = getCellValue(row, headerMap, "estado_render").toLowerCase();

      if (
        estadoRenderOriginal !== STATUS.PENDING &&
        estadoRenderOriginal !== STATUS.ERROR
      ) {
        groupLogger.info("Slide ya renderizado, saltando", {
          rowNumber,
          estadoRender: estadoRenderOriginal
        });
        continue;
      }

      if (!textToRender) {
        throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
      }

      const rowLogger = groupLogger.child({ rowNumber, rowId, order: item.order, mode });

      rowLogger.info("Renderizando slide", {
        textLength: textToRender.length,
        backgroundColor: carouselBg
      });

      const result = await renderPhrase({ text: textToRender, mode, bg: carouselBg });

      await markSlideAsRendered({
        sheets,
        headerMap,
        rowNumber,
        carouselBg,
        fileName: result.fileName
      });

      rowLogger.info("Slide renderizado correctamente", { outputFile: result.fileName });
    }

    groupLogger.info("Carrusel renderizado completo", { backgroundColor: carouselBg });
  } catch (error) {
    await markCarouselGroupAsError(
      sheets,
      headerMap,
      groupRows,
      "carousel-render",
      error.message || String(error),
      cycleId
    );

    groupLogger.error("Error renderizando carrusel", {}, error);

    throw error;
  }
}

runRenderJob("render-carousel-from-sheet", main);
