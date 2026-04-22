const { google } = require("googleapis");
const { getSheetsAuth } = require("../auth/google-auth");
const { normalizeValue, colToLetter } = require("../utils/common");

const SHEET_ID = process.env.SHEET_ID;
const WORKSHEET_NAME = process.env.WORKSHEET_NAME;
const SHEET_RANGE = process.env.SHEET_RANGE || "A:AZ";

if (!SHEET_ID) {
  throw new Error("Falta SHEET_ID en el .env");
}

if (!WORKSHEET_NAME) {
  throw new Error("Falta WORKSHEET_NAME en el .env");
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
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error("No se encontraron encabezados en la hoja");
  }

  const map = {};

  headers.forEach((header, index) => {
    const normalized = normalizeValue(header);

    if (!normalized) {
      return;
    }

    if (map[normalized] !== undefined) {
      throw new Error(
        `Encabezado duplicado detectado en la hoja: ${normalized}`
      );
    }

    map[normalized] = index;
  });

  return map;
}

function requireHeaders(headerMap, requiredHeaders) {
  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }
}

function getCellValue(row, headerMap, key) {
  if (!(key in headerMap)) {
    throw new Error(`La columna no existe en el headerMap: ${key}`);
  }

  return normalizeValue(row?.[headerMap[key]]);
}

async function readRows(sheets) {
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!${SHEET_RANGE}`
  });

  return readRes.data.values || [];
}

async function updateCellsBatch(sheets, updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return;
  }

  const data = updates.map((item) => {
    if (
      item.row === undefined ||
      item.col === undefined
    ) {
      throw new Error("Cada update debe incluir row y col");
    }

    if (!Number.isInteger(item.row) || item.row < 1) {
      throw new Error(`Fila inválida en updateCellsBatch: ${item.row}`);
    }

    if (!Number.isInteger(item.col) || item.col < 1) {
      throw new Error(`Columna inválida en updateCellsBatch: ${item.col}`);
    }

    return {
      range: `${WORKSHEET_NAME}!${colToLetter(item.col)}${item.row}`,
      values: [[item.value ?? ""]]
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data
    }
  });
}

module.exports = {
  SHEET_ID,
  WORKSHEET_NAME,
  SHEET_RANGE,
  getSheetsClient,
  buildHeaderMap,
  requireHeaders,
  getCellValue,
  readRows,
  updateCellsBatch
};