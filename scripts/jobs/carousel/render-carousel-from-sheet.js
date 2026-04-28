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

function getPendingCarouselRows(rows, headerMap) {
  let selectedCarouselId = "";

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
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    const isEligible =
      postTipo === "carousel" &&
      (estadoRender === "pending" || estadoRender === "error") &&
      lockStatus === "free" &&
      carouselId;

    if (isEligible) {
      const targetId = process.env.TARGET_CAROUSEL_ID || "";
      if (targetId && carouselId !== targetId) continue;
      selectedCarouselId = carouselId;
      break;
    }
  }

  if (!selectedCarouselId) {
    return { selectedCarouselId: "", groupRows: [] };
  }

  const groupRows = [];

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
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    const belongsToSelected =
      postTipo === "carousel" &&
      carouselId === selectedCarouselId;

    if (belongsToSelected) {
      groupRows.push({
        rowNumber: i + 1,
        values: row,
        order: Number(normalizeValue(row[headerMap["carousel_order"]]) || "0")
      });
    }
  }

  groupRows.sort((a, b) => a.order - b.order);

  return { selectedCarouselId, groupRows };
}

function validateCarouselRows(groupRows, selectedCarouselId) {
  if (groupRows.length < 2 || groupRows.length > 10) {
    throw new Error(
      `El carrusel ${selectedCarouselId} tiene ${groupRows.length} slides. Debe tener entre 2 y 10.`
    );
  }

  const orders = groupRows.map((item) => item.order);

  if (orders.some((order) => !Number.isInteger(order) || order < 1)) {
    throw new Error(
      `El carrusel ${selectedCarouselId} tiene carousel_order inválidos. Deben ser enteros mayores o iguales a 1.`
    );
  }

  const uniqueOrders = new Set(orders);

  if (uniqueOrders.size !== orders.length) {
    throw new Error(
      `El carrusel ${selectedCarouselId} tiene carousel_order duplicados.`
    );
  }
}

async function markGroupAsError(sheets, headerMap, groupRows, cycleId, errorMessage, attemptsDelta = 1) {
  const now = nowIsoLocal();
  const updates = [];

  for (const item of groupRows) {
    const row = item.values;
    const estadoRender = normalizeValue(row[headerMap["estado_render"]]).toLowerCase();

    updates.push(
      {
        row: item.rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "processing"
      },
      {
        row: item.rowNumber,
        col: headerMap["lock_status"] + 1,
        value: "locked"
      },
      {
        row: item.rowNumber,
        col: headerMap["last_cycle_id"] + 1,
        value: cycleId
      },
      {
        row: item.rowNumber,
        col: headerMap["updated_at"] + 1,
        value: lockTime
      },
      {
        row: item.rowNumber,
        col: headerMap["error_step"] + 1,
        value: ""
      },
      {
        row: item.rowNumber,
        col: headerMap["error_message"] + 1,
        value: ""
      }
    );

    if (estadoRender === "pending" || estadoRender === "error") {
      updates.push({
        row: item.rowNumber,
        col: headerMap["estado_render"] + 1,
        value: "processing"
      });
    }
  }

  await updateCellsBatch(sheets, updates);
}

async function main() {
  const cycleId = process.env.PIPELINE_CYCLE_ID || "";
  const log = logger.child({
    job: "render-carousel",
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

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  const { selectedCarouselId, groupRows } = getPendingCarouselRows(rows, headerMap);

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

  const lastPublishedBg = getLastPublishedBg(rows, headerMap);
  const carouselBg = getNextColor(lastPublishedBg);
  const lockTime = nowIsoLocal();

  const lockUpdates = [];

  for (const item of groupRows) {
    lockUpdates.push(
      {
        row: item.rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "processing"
      },
      {
        row: item.rowNumber,
        col: headerMap["estado_render"] + 1,
        value: "processing"
      },
      {
        row: item.rowNumber,
        col: headerMap["lock_status"] + 1,
        value: "locked"
      },
      {
        row: item.rowNumber,
        col: headerMap["last_cycle_id"] + 1,
        value: cycleId
      },
      {
        row: item.rowNumber,
        col: headerMap["updated_at"] + 1,
        value: lockTime
      },
      {
        row: item.rowNumber,
        col: headerMap["error_step"] + 1,
        value: ""
      },
      {
        row: item.rowNumber,
        col: headerMap["error_message"] + 1,
        value: ""
      },
    );
  }

  await updateCellsBatch(sheets, lockUpdates);

  try {
    for (const item of groupRows) {
      const rowNumber = item.rowNumber;
      const row = item.values;

      const rowId = normalizeValue(row[headerMap["row_id"]]);
      const fraseOriginal = normalizeValue(row[headerMap["frase_original"]]);
      const fraseCorregida = normalizeValue(row[headerMap["frase_corregida"]]);
      const mode = normalizeValue(row[headerMap["modo"]]) || "retro3d";
      const textToRender = fraseCorregida || fraseOriginal;
      const estadoRender = normalizeValue(row[headerMap["estado_render"]]).toLowerCase();

      if (estadoRender !== "pending" && estadoRender !== "error") {
        continue;
      }


      if (!textToRender) {
        throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
      }

      const rowLogger = groupLogger.child({
        rowNumber,
        rowId,
        order: item.order,
        mode
      });

      rowLogger.info("Renderizando slide", {
        textLength: textToRender.length,
        backgroundColor: carouselBg
      });

      const result = await renderPhrase({
        text: textToRender,
        mode,
        bg: carouselBg
      });

      await updateCellsBatch(sheets, [
        {
          row: rowNumber,
          col: headerMap["background_color"] + 1,
          value: carouselBg
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

      rowLogger.info("Slide renderizado correctamente", {
        outputFile: result.fileName
      });
    }

    groupLogger.info("Carrusel renderizado completo", {
      backgroundColor: carouselBg
    });
  } catch (error) {
    await markGroupAsError(
      sheets,
      headerMap,
      groupRows,
      cycleId,
      error.message || String(error)
    );

    groupLogger.error("Error renderizando carrusel", {}, error);
    throw error;
  }
}

main().catch((err) => {
  logger.error("Error en render-carousel-from-sheet", {}, err);
  process.exit(1);
});