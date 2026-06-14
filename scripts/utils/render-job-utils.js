const { getCellValue } = require("../core/sheets");
const { getNextBackgroundColor } = require("./render-utils");
const { stopServer } = require("../libs/render-lib");
const { logger } = require("./logger");
const {
  STATUS,
  GENERAL_STATUS,
  LOCK_STATUS
} = require("../core/status");

function runRenderJob(jobName, main) {
  main()
    .catch((err) => {
      logger.error(`Error en ${jobName}`, {}, err);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await stopServer();
      } catch (stopError) {
        logger.warn("No se pudo cerrar el servidor de render", {}, stopError);
      }
      process.exit(process.exitCode ?? 0);
    });
}

function buildProcessingUpdates(headerMap, rowNumber, cycleId, lockTs) {
  return [
    { row: rowNumber, col: headerMap["estado_general"] + 1, value: GENERAL_STATUS.PROCESSING },
    { row: rowNumber, col: headerMap["estado_render"]  + 1, value: STATUS.PROCESSING },
    { row: rowNumber, col: headerMap["lock_status"]    + 1, value: LOCK_STATUS.LOCKED },
    { row: rowNumber, col: headerMap["last_cycle_id"]  + 1, value: cycleId },
    { row: rowNumber, col: headerMap["updated_at"]     + 1, value: lockTs },
    { row: rowNumber, col: headerMap["error_step"]     + 1, value: "" },
    { row: rowNumber, col: headerMap["error_message"]  + 1, value: "" }
  ];
}

function buildRenderedUpdates(headerMap, rowNumber, bg, fileName, doneTs) {
  return [
    { row: rowNumber, col: headerMap["background_color"] + 1, value: bg },
    { row: rowNumber, col: headerMap["output_file"]      + 1, value: fileName },
    { row: rowNumber, col: headerMap["fecha_generado"]   + 1, value: doneTs },
    { row: rowNumber, col: headerMap["estado_render"]    + 1, value: STATUS.DONE },
    { row: rowNumber, col: headerMap["lock_status"]   + 1, value: LOCK_STATUS.FREE },
    { row: rowNumber, col: headerMap["updated_at"]    + 1, value: doneTs },
    { row: rowNumber, col: headerMap["error_step"]    + 1, value: "" },
    { row: rowNumber, col: headerMap["error_message"] + 1, value: "" }
  ];
}

function resolveBackgroundColor(row, rows, headerMap) {
  const existingBg = getCellValue(row, headerMap, "background_color");

  if (existingBg) {
    return existingBg;
  }

  return getNextBackgroundColor(rows, headerMap);
}

function extractPhraseFields(row, headerMap) {
  const rowId          = getCellValue(row, headerMap, "row_id");
  const fraseOriginal  = getCellValue(row, headerMap, "frase_original");
  const fraseCorregida = getCellValue(row, headerMap, "frase_corregida");
  const mode           = getCellValue(row, headerMap, "modo") || "retro3d";
  const textToRender   = fraseCorregida || fraseOriginal;

  return { rowId, fraseOriginal, fraseCorregida, mode, textToRender };
}

module.exports = {
  runRenderJob,
  buildProcessingUpdates,
  buildRenderedUpdates,
  resolveBackgroundColor,
  extractPhraseFields
};
