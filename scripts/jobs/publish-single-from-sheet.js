require("dotenv").config();

const { google } = require("googleapis");
const { publishImagePost } = require("../libs/instagram-lib");
const { deleteImage } = require("../libs/upload-lib");
const { getSheetsAuth } = require("../auth/google-auth");

const SHEET_ID = process.env.SHEET_ID;
const WORKSHEET_NAME = process.env.WORKSHEET_NAME;

if (!SHEET_ID) {
  throw new Error("Falta SHEET_ID en el .env");
}

if (!WORKSHEET_NAME) {
  throw new Error("Falta WORKSHEET_NAME en el .env");
}

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
    "media_url",
    "caption",
    "cloudinary_public_id",
    "post_id",
    "fecha_publicado",
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

    if (estado === "lista_para_publicar") {
      targetRow = {
        rowNumber: i + 1,
        values: row
      };
      break;
    }
  }

  if (!targetRow) {
    console.log('No hay filas con estado "lista_para_publicar".');
    process.exit(10);
  }

  const rowNumber = targetRow.rowNumber;
  const row = targetRow.values;

  const mediaUrl = normalizeValue(row[headerMap["media_url"]]);
  const rawCaption = row[headerMap["caption"]];
  const caption = normalizeValue(rawCaption) || "";
  const cloudinaryPublicId = normalizeValue(row[headerMap["cloudinary_public_id"]]);

  if (!mediaUrl) {
    throw new Error(`La fila ${rowNumber} no tiene media_url.`);
  }

  console.log(`Publicando fila ${rowNumber}: ${mediaUrl}`);
  console.log(`Caption fila ${rowNumber}:`, caption || "[sin caption]");

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado"] + 1,
      value: "publicando_instagram"
    },
    {
      row: rowNumber,
      col: headerMap["error"] + 1,
      value: ""
    }
  ]);

  try {
    const result = await publishImagePost({
      imageUrl: mediaUrl,
      caption
    });

    if (cloudinaryPublicId) {
      try {
        const deletionResult = await deleteImage(cloudinaryPublicId);
        console.log("Resultado borrado Cloudinary:", deletionResult);
      } catch (deleteErr) {
        console.warn(`No se pudo borrar el asset de Cloudinary: ${cloudinaryPublicId}`);
        console.warn(deleteErr.message || deleteErr);
      }
    }

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["post_id"] + 1,
        value: result.mediaId
      },
      {
        row: rowNumber,
        col: headerMap["fecha_publicado"] + 1,
        value: nowIsoLocal()
      },
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "publicado"
      },
      {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ]);

    console.log(`Fila ${rowNumber} publicada correctamente.`);
    console.log(`Post ID: ${result.mediaId}`);
    console.log(`Creation ID: ${result.creationId}`);
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: "error_publish"
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
  console.error("Error en publish-single-from-sheet:", err);
  process.exit(1);
});