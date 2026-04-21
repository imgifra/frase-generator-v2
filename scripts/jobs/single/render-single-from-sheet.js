require("dotenv").config();

const { renderPhrase } = require("../../libs/render-lib");
const {
  getSheetsClient,
  buildHeaderMap,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");
const { normalizeValue, nowIsoLocal } = require("../../utils/common");
const { logger } = require("../../utils/logger");

const BG_SEQUENCE = [
  "#f4c400", // retroYellow
  "#3d5afe", // retroBlue
  "#e53935", // retroRed
  "#f6f1e8", // retroWhite
  "#0d0f14"  // retroBlack
];

function getLastPublishedBg(rows, headerMap) {
  const estadoGeneralCol = headerMap["estado_general"];
  const backgroundColorCol = headerMap["background_color"];
  const fechaPublicadoCol = headerMap["fecha_publicado"];
  const postTipoCol = headerMap["post_tipo"];

  if (
    estadoGeneralCol === undefined ||
    backgroundColorCol === undefined ||
    fechaPublicadoCol === undefined ||
    postTipoCol === undefined
  ) {
    return "";
  }

  let latestBg = "";
  let latestTime = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const estadoGeneral = normalizeValue(row[estadoGeneralCol]).toLowerCase();
    const bg = normalizeValue(row[backgroundColorCol]);
    const fechaPublicado = normalizeValue(row[fechaPublicadoCol]);
    const postTipo = normalizeValue(row[postTipoCol]).toLowerCase();

    if (
      estadoGeneral !== "published" ||
      postTipo !== "single" ||
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

function findNextSingleRow(rows, headerMap) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const postTipo = normalizeValue(row[headerMap["post_tipo"]]).toLowerCase();
    const estadoGeneral = normalizeValue(
      row[headerMap["estado_general"]]
    ).toLowerCase();
    const estadoRender = normalizeValue(
      row[headerMap["estado_render"]]
    ).toLowerCase();
    const lockStatus = normalizeValue(row[headerMap["lock_status"]]).toLowerCase();

    const isEligible =
      postTipo === "single" &&
      (estadoGeneral === "pending" || estadoGeneral === "error") &&
      (estadoRender === "pending" || estadoRender === "error") &&
      lockStatus === "free";

    if (isEligible) {
      return {
        rowNumber: i + 1,
        values: row
      };
    }
  }

  return null;
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

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  const selectedRow = findNextSingleRow(rows, headerMap);

  if (!selectedRow) {
    log.info("No hay singles pendientes para render");
    process.exit(10);
  }

  const rowNumber = selectedRow.rowNumber;
  const row = selectedRow.values;

  const rowId = normalizeValue(row[headerMap["row_id"]]);
  const fraseOriginal = normalizeValue(row[headerMap["frase_original"]]);
  const fraseCorregida = normalizeValue(row[headerMap["frase_corregida"]]);
  const mode = normalizeValue(row[headerMap["modo"]]) || "retro3d";
  const textToRender = fraseCorregida || fraseOriginal;
  const currentAttempts = Number(normalizeValue(row[headerMap["intentos"]]) || 0);

  const rowLogger = log.child({
    rowNumber,
    rowId,
    mode
  });

  if (!textToRender) {
    throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
  }

  const lastPublishedBg = getLastPublishedBg(rows, headerMap);
  const bg = getNextColor(lastPublishedBg);
  const now = nowIsoLocal();

  rowLogger.info("Fila seleccionada para render", {
    textLength: textToRender.length,
    nextBg: bg
  });

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado_general"] + 1,
      value: "processing"
    },
    {
      row: rowNumber,
      col: headerMap["estado_render"] + 1,
      value: "processing"
    },
    {
      row: rowNumber,
      col: headerMap["lock_status"] + 1,
      value: "locked"
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
        value: "done"
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
      outputFile: result.fileName
    });
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "error"
      },
      {
        row: rowNumber,
        col: headerMap["estado_render"] + 1,
        value: "error"
      },
      {
        row: rowNumber,
        col: headerMap["lock_status"] + 1,
        value: "free"
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