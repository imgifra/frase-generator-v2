require("dotenv").config();

const { google } = require("googleapis");
const { renderPhrase } = require("../libs/render-lib");
const { getSheetsAuth } = require("../auth/google-auth");

const SHEET_ID = process.env.SHEET_ID;
const WORKSHEET_NAME = process.env.WORKSHEET_NAME;

if (!SHEET_ID) {
  throw new Error("Falta SHEET_ID en el .env");
}

if (!WORKSHEET_NAME) {
  throw new Error("Falta WORKSHEET_NAME en el .env");
}

const BG_SEQUENCE = [
  "#f4c400", // retroYellow
  "#3d5afe", // retroBlue
  "#e53935", // retroRed
  "#f6f1e8", // retroWhite
  "#0d0f14"  // retroBlack
];

function normalizeValue(value) {
  return (value || "").toString().trim();
}

function nowIsoLocal() {
  return new Date().toISOString();
}

async function getSheetsClient() {
  const auth = getSheetsAuth();
  const authClient = await auth.getClient();

  return google.sheets({
    version: "v4",
    auth: authClient
  });
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[normalizeValue(header)] = index;
  });
  return map;
}

function colToLetter(colNumber) {
  let temp = colNumber;
  let letter = "";

  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - rem - 1) / 26);
  }

  return letter;
}

async function updateCellsBatch(sheets, updates) {
  const data = updates.map((item) => ({
    range: `${WORKSHEET_NAME}!${colToLetter(item.col)}${item.row}`,
    values: [[item.value]]
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data
    }
  });
}

function getLastPublishedBg(rows, headerMap) {
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const estado = normalizeValue(row[headerMap["estado"]]);
    const bg = normalizeValue(row[headerMap["bg"]]).toLowerCase();

    if (estado === "publicado" && bg) {
      return bg;
    }
  }

  return "";
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
    const estado = normalizeValue(row[headerMap["estado"]]);
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    if (
      postTipo === "carousel" &&
      estado === "lista_para_render_carousel" &&
      carouselId
    ) {
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
    const estado = normalizeValue(row[headerMap["estado"]]);
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    if (
      postTipo === "carousel" &&
      estado === "lista_para_render_carousel" &&
      carouselId === selectedCarouselId
    ) {
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

async function main() {
  const sheets = await getSheetsClient();

  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:Z`
  });

  const rows = readRes.data.values || [];

  if (rows.length < 2) {
    console.log("No hay datos en la hoja.");
    return;
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);

  const requiredHeaders = [
    "frase_original",
    "frase_corregida",
    "modo",
    "bg",
    "estado",
    "output_file",
    "fecha_generado",
    "error",
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
    console.log('No hay carruseles con estado "lista_para_render_carousel".');
    process.exit(10);
  }

  validateCarouselRows(groupRows, selectedCarouselId);

  console.log(`Renderizando carrusel ${selectedCarouselId} con ${groupRows.length} slides`);

  const lastPublishedBg = getLastPublishedBg(rows, headerMap);
  const carouselBg = getNextColor(lastPublishedBg);

  for (const item of groupRows) {
    const rowNumber = item.rowNumber;
    const row = item.values;

    const fraseOriginal = normalizeValue(row[headerMap["frase_original"]]);
    const fraseCorregida = normalizeValue(row[headerMap["frase_corregida"]]);
    const mode = normalizeValue(row[headerMap["modo"]]) || "retro3d";
    const textToRender = fraseCorregida || fraseOriginal;

    if (!textToRender) {
      throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
    }

    console.log(`Slide ${item.order} | fila ${rowNumber} | color ${carouselBg}`);
    console.log(`Texto: ${textToRender}`);

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "procesando_render_carousel"
      },
      {
        row: rowNumber,
        col: headerMap["bg"] + 1,
        value: carouselBg
      },
      {
        row: rowNumber,
        col: headerMap["output_file"] + 1,
        value: ""
      },
      {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ]);

    try {
      const result = await renderPhrase({
        text: textToRender,
        mode,
        bg: carouselBg
      });

      await updateCellsBatch(sheets, [
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
          col: headerMap["estado"] + 1,
          value: "renderizado_carousel"
        },
        {
          row: rowNumber,
          col: headerMap["error"] + 1,
          value: ""
        }
      ]);

      console.log(`Fila ${rowNumber} renderizada correctamente.`);
      console.log(`Archivo: ${result.fileName}`);
    } catch (error) {
      await updateCellsBatch(sheets, [
        {
          row: rowNumber,
          col: headerMap["estado"] + 1,
          value: "error_render"
        },
        {
          row: rowNumber,
          col: headerMap["error"] + 1,
          value: error.message || String(error)
        }
      ]);

      throw error;
    }
  }

  console.log(`Carrusel ${selectedCarouselId} renderizado completo.`);
}

main().catch((err) => {
  console.error("Error en render-carousel-from-sheet:", err);
  process.exit(1);
});