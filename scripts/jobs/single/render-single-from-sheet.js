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
  LOCK_STATUS
} = require("../../core/status");

const BG_SEQUENCE = [
  "#f4c400", // retroYellow
  "#3d5afe", // retroBlue
  "#e53935", // retroRed
  "#f6f1e8", // retroWhite
  "#0d0f14"  // retroBlack
];

/**
 * Devuelve el último background_color de un post single que sí quedó publicado.
 */
function getLastPublishedBg(rows, headerMap) {
  let latestBg = "";
  let latestTime = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const estadoGeneral = getCellValue(row, headerMap, "estado_general").toLowerCase();
    const bg = getCellValue(row, headerMap, "background_color");
    const fechaPublicado = getCellValue(row, headerMap, "fecha_publicado");
    const postTipo = getCellValue(row, headerMap, "post_tipo").toLowerCase();

    if (
      estadoGeneral !== GENERAL_STATUS.PUBLISHED ||
      !["single", "carousel"].includes(postTipo) ||
      !bg ||
      !fechaPublicado
    ) {
      continue;
    }

    const timestamp = Date.parse(fechaPublicado);

    if (Number.isNaN(timestamp)) {
      continue;
    }

    if (timestamp > latestTime) {
      latestTime = timestamp;
      latestBg = bg.toLowerCase();
    }
  }

  return latestBg;
}

function getNextColor(color) {
  if (!color) return BG_SEQUENCE[0];

  const index = BG_SEQUENCE.findIndex(
    (item) => item.toLowerCase() === color.toLowerCase()
  );

  if (index === -1) return BG_SEQUENCE[0];

  return BG_SEQUENCE[(index + 1) % BG_SEQUENCE.length];
}

/**
 * Este job SOLO debe escoger filas que necesiten render.
 *
 * No depende de estado_general.
 * Si una fila ya tiene render done, no se vuelve a renderizar
 * aunque haya fallado upload o publish.
 */
function findNextSingleRowForRender(rows, headerMap) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const postTipo = getCellValue(row, headerMap, "post_tipo").toLowerCase();
    const estadoRender = getCellValue(row, headerMap, "estado_render").toLowerCase();
    const lockStatus = getCellValue(row, headerMap, "lock_status").toLowerCase();

    const isEligible =
      postTipo === POST_TIPOS.SINGLE &&
      (estadoRender === STATUS.PENDING || estadoRender === STATUS.ERROR) &&
      lockStatus === LOCK_STATUS.FREE;

    if (isEligible) {
      return {
        rowNumber: i + 1,
        values: row
      };
    }
  }

  return null;
}

function getBgForRow(row, rows, headerMap) {
  const existingBg = getCellValue(row, headerMap, "background_color");

  if (existingBg) {
    return existingBg;
  }

  const lastPublishedBg = getLastPublishedBg(rows, headerMap);
  return getNextColor(lastPublishedBg);
}

async function main() {
  const cycleId = process.env.PIPELINE_CYCLE_ID || "";
  const log = logger.child({
    job: "render-single",
    cycleId
  });

  const sheets = await getSheetsClient();
  const rows = await readRows(sheets);

  if (rows.length < 2) {
    log.info("No hay datos en la hoja");
    return;
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);

  const requiredHeaders = [
    "row_id",
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
    "updated_at"
  ];

  requireHeaders(headerMap, requiredHeaders);

  const selectedRow = findNextSingleRowForRender(rows, headerMap);

  if (!selectedRow) {
    log.info("No hay singles pendientes para render");
    process.exit(10);
  }

  const rowNumber = selectedRow.rowNumber;
  const row = selectedRow.values;

  const rowId = getCellValue(row, headerMap, "row_id");
  const fraseOriginal = getCellValue(row, headerMap, "frase_original");
  const fraseCorregida = getCellValue(row, headerMap, "frase_corregida");
  const mode = getCellValue(row, headerMap, "modo") || "retro3d";
  const textToRender = fraseCorregida || fraseOriginal;
  const currentAttempts = Number(getCellValue(row, headerMap, "intentos") || 0);

  const rowLogger = log.child({
    rowNumber,
    rowId,
    mode
  });

  if (!textToRender) {
    throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
  }

  const bg = getBgForRow(row, rows, headerMap);
  const now = nowIsoLocal();

  rowLogger.info("Fila seleccionada para render", {
    textLength: textToRender.length,
    selectedBg: bg
  });

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado_general"] + 1,
      value: GENERAL_STATUS.PROCESSING
    },
    {
      row: rowNumber,
      col: headerMap["estado_render"] + 1,
      value: STATUS.PROCESSING
    },
    {
      row: rowNumber,
      col: headerMap["lock_status"] + 1,
      value: LOCK_STATUS.LOCKED
    },
    {
      row: rowNumber,
      col: headerMap["last_cycle_id"] + 1,
      value: cycleId
    },
    {
      row: rowNumber,
      col: headerMap["updated_at"] + 1,
      value: now
    },
    {
      row: rowNumber,
      col: headerMap["error_step"] + 1,
      value: ""
    },
    {
      row: rowNumber,
      col: headerMap["error_message"] + 1,
      value: ""
    }
  ]);

  try {
    const result = await renderPhrase({
      text: textToRender,
      mode,
      bg
    });

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["background_color"] + 1,
        value: bg
      },
      {
        row: rowNumber,
        col: headerMap["output_file"] + 1,
        value: result.fileName
      },
      {
        row: rowNumber,
        col: headerMap["fecha_generado"] + 1,
        value: nowIsoLocal()
      },
      {
        row: rowNumber,
        col: headerMap["estado_render"] + 1,
        value: STATUS.DONE
      },
      {
        row: rowNumber,
        col: headerMap["updated_at"] + 1,
        value: nowIsoLocal()
      },
      {
        row: rowNumber,
        col: headerMap["error_step"] + 1,
        value: ""
      },
      {
        row: rowNumber,
        col: headerMap["error_message"] + 1,
        value: ""
      }
    ]);

    rowLogger.info("Fila renderizada correctamente", {
      outputFile: result.fileName,
      bg
    });
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado_general"] + 1,
        value: GENERAL_STATUS.ERROR
      },
      {
        row: rowNumber,
        col: headerMap["estado_render"] + 1,
        value: STATUS.ERROR
      },
      {
        row: rowNumber,
        col: headerMap["lock_status"] + 1,
        value: LOCK_STATUS.FREE
      },
      {
        row: rowNumber,
        col: headerMap["intentos"] + 1,
        value: currentAttempts + 1
      },
      {
        row: rowNumber,
        col: headerMap["error_step"] + 1,
        value: "render"
      },
      {
        row: rowNumber,
        col: headerMap["error_message"] + 1,
        value: error.message || String(error)
      },
      {
        row: rowNumber,
        col: headerMap["updated_at"] + 1,
        value: nowIsoLocal()
      }
    ]);

    rowLogger.error("Error renderizando fila", {}, error);
    throw error;
  }
}

main().catch((err) => {
  logger.error("Error en render-single-from-sheet", {}, err);
  process.exit(1);
});