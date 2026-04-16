const fs = require("fs");
require("dotenv").config();

const path = require("path");
const { google } = require("googleapis");
const { uploadImage } = require("./upload-lib");

const SERVICE_ACCOUNT_FILE = path.join(__dirname, "..", "service_account.json");
const SHEET_ID = process.env.SHEET_ID || "1LgDI-wWKXAaLAQoJCJDA4k0Grtra-I4pWnUtz3Gj__M";
const WORKSHEET_NAME = process.env.WORKSHEET_NAME || "Hoja 1";
const OUTPUT_DIR = path.join(__dirname, "..", "output");

function normalizeValue(value) {
  return (value || "").toString().trim();
}

function nowIsoLocal() {
  return new Date().toISOString();
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

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
    "estado",
    "output_file",
    "media_url",
    "cloudinary_public_id",
    "fecha_upload",
    "error"
  ];

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  let targetRow = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const estado = normalizeValue(row[headerMap["estado"]]);

    if (estado === "renderizado") {
      targetRow = {
        rowNumber: i + 1,
        values: row
      };
      break;
    }
  }

  if (!targetRow) {
    console.log('No hay filas con estado "renderizado".');
    process.exit(10);
  }

  const rowNumber = targetRow.rowNumber;
  const row = targetRow.values;

  const outputFile = normalizeValue(row[headerMap["output_file"]]);

  if (!outputFile) {
    throw new Error(`La fila ${rowNumber} no tiene output_file.`);
  }

  const localPath = path.join(OUTPUT_DIR, outputFile);

  if (!fs.existsSync(localPath)) {
    throw new Error(`No existe el archivo local: ${localPath}`);
  }

  console.log(`Subiendo fila ${rowNumber}: ${outputFile}`);

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado"] + 1,
      value: "subiendo_media"
    },
    {
      row: rowNumber,
      col: headerMap["error"] + 1,
      value: ""
    }
  ]);

  try {
    const uploadResult = await uploadImage(localPath, outputFile);

    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
        console.log(`Archivo local eliminado: ${localPath}`);
      } catch (deleteErr) {
        console.warn(`No se pudo eliminar el archivo local: ${localPath}`);
        console.warn(deleteErr.message || deleteErr);
      }
    }

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["media_url"] + 1,
        value: uploadResult.secureUrl
      },
      {
        row: rowNumber,
        col: headerMap["cloudinary_public_id"] + 1,
        value: uploadResult.publicId
      },
      {
        row: rowNumber,
        col: headerMap["fecha_upload"] + 1,
        value: nowIsoLocal()
      },
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "lista_para_publicar"
      },
      {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ]);

    console.log(`Fila ${rowNumber} subida correctamente.`);
    console.log(`URL: ${uploadResult.secureUrl}`);
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "error_upload"
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
  console.error("Error en upload-from-sheet:", err);
  process.exit(1);
});