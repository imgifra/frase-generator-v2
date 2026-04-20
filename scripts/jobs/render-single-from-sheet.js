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
  const estadoCol = headerMap["estado"];
  const bgCol = headerMap["bg"];
  const fechaPublicadoCol = headerMap["fecha_publicado"];

  if (
    estadoCol === undefined ||
    bgCol === undefined ||
    fechaPublicadoCol === undefined
  ) {
    return "";
  }

  let latestBg = "";
  let latestTime = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const estado = normalizeValue(row[estadoCol]);
    const bg = normalizeValue(row[bgCol]);
    const fechaPublicado = normalizeValue(row[fechaPublicadoCol]);

    if (estado !== "publicado" || !bg || !fechaPublicado) {
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
    "post_tipo",
    "output_file",
    "fecha_generado",
    "fecha_publicado",
    "error"
  ];

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  let selectedRow = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const estado = normalizeValue(row[headerMap["estado"]]);
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);

    if (
      estado === "lista_para_render" &&
      postTipo === "single"
    ) {
      selectedRow = {
        rowNumber: i + 1,
        values: row
      };
      break;
    }
  }

  if (!selectedRow) {
    console.log('No hay filas con estado "lista_para_render".');
    process.exit(10);
  }

  const rowNumber = selectedRow.rowNumber;
  const row = selectedRow.values;

  const fraseOriginal = normalizeValue(row[headerMap["frase_original"]]);
  const fraseCorregida = normalizeValue(row[headerMap["frase_corregida"]]);
  const mode = normalizeValue(row[headerMap["modo"]]) || "retro3d";
  const textToRender = fraseCorregida || fraseOriginal;

  if (!textToRender) {
    throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
  }

  const lastPublishedBg = getLastPublishedBg(rows, headerMap);
  const bg = getNextColor(lastPublishedBg);

  console.log(`Renderizando fila ${rowNumber}`);
  console.log(`Texto: ${textToRender}`);
  console.log(`Modo: ${mode}`);
  console.log(`Color: ${bg}`);

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado"] + 1,
      value: "procesando_render"
    },
    {
      row: rowNumber,
      col: headerMap["bg"] + 1,
      value: bg
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
      bg
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
        value: "renderizado"
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

main().catch((err) => {
  console.error("Error en render-single-from-sheet:", err);
  process.exit(1);
});