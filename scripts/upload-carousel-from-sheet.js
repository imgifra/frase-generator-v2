require("dotenv").config();
const path = require("path");
const { google } = require("googleapis");
const { uploadImage } = require("./upload-lib");
const { getSheetsAuth } = require("./google-auth");

const SHEET_ID = process.env.SHEET_ID;
const WORKSHEET_NAME = process.env.WORKSHEET_NAME || "Hoja 1";

function normalizeValue(value) {
  return (value || "").toString().trim();
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

async function main() {
  const sheets = await getSheetsClient();

  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:Z`
  });

  const rows = readRes.data.values || [];

  if (rows.length < 2) {
    console.log("No hay datos.");
    return;
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);

  let selectedCarouselId = "";

  // 🔎 Buscar un carrusel listo para upload
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const estado = normalizeValue(row[headerMap["estado"]]);
    const tipo = normalizeValue(row[headerMap["post_tipo"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    if (
      tipo === "carousel" &&
      estado === "renderizado_carousel" &&
      carouselId
    ) {
      selectedCarouselId = carouselId;
      break;
    }
  }

  if (!selectedCarouselId) {
    console.log("No hay carruseles para subir.");
    process.exit(10);
  }

  console.log(`Subiendo carrusel: ${selectedCarouselId}`);

  const groupRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (
      normalizeValue(row[headerMap["post_tipo"]]) === "carousel" &&
      normalizeValue(row[headerMap["estado"]]) === "renderizado_carousel" &&
      normalizeValue(row[headerMap["carousel_id"]]) === selectedCarouselId
    ) {
      groupRows.push({
        rowNumber: i + 1,
        values: row,
        order: Number(row[headerMap["carousel_order"]] || 0)
      });
    }
  }

  groupRows.sort((a, b) => a.order - b.order);

  for (const item of groupRows) {
    const rowNumber = item.rowNumber;
    const row = item.values;
    
    const fileName = normalizeValue(row[headerMap["output_file"]]);

    if (!fileName) {
    throw new Error(`Fila ${rowNumber} no tiene archivo renderizado.`);
    }

    const localPath = path.join(__dirname, "..", "output", fileName);

    console.log(`Subiendo slide ${item.order}: ${fileName}`);
    console.log(`Ruta local: ${localPath}`);

    await updateCellsBatch(sheets, [
    {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "subiendo_carousel"
    }
    ]);

    try {
    const result = await uploadImage(localPath, fileName);

    await updateCellsBatch(sheets, [
        {
        row: rowNumber,
        col: headerMap["media_url"] + 1,
        value: result.secureUrl
        },
        {
        row: rowNumber,
        col: headerMap["cloudinary_public_id"] + 1,
        value: result.publicId
        },
        {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "listo_para_publicar_carousel"
        }
    ]);

    console.log(`Fila ${rowNumber} subida OK`);
    } catch (err) {
    await updateCellsBatch(sheets, [
        {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "error_upload"
        },
        {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: err.message
        }
    ]);

    throw err;
    }
  }

  console.log("Carrusel subido completo.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
