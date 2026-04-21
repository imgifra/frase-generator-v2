require("dotenv").config();

const { google } = require("googleapis");
const { getSheetsAuth } = require("../auth/google-auth");

const SHEET_ID = process.env.SHEET_ID;

const MASTER_SHEET = "Hoja 1";
const SOURCE_SHEET = "Hoja 2";

if (!SHEET_ID) {
  throw new Error("Falta SHEET_ID en el .env");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (key) {
      map[key] = index;
    }
  });
  return map;
}

function getComparablePhrase(row, headerMap) {
  const fraseCorregida = normalizeText(row[headerMap["frase_corregida"]]);
  const fraseOriginal = normalizeText(row[headerMap["frase_original"]]);
  return fraseCorregida || fraseOriginal;
}

function makeEmptyRow(length) {
  return Array.from({ length }, () => "");
}

function setValue(row, headerMap, key, value) {
  if (headerMap[key] !== undefined) {
    row[headerMap[key]] = value;
  }
}

async function main() {
  const auth = getSheetsAuth();
  const authClient = await auth.getClient();

  const sheets = google.sheets({
    version: "v4",
    auth: authClient
  });

  const [masterRes, sourceRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${MASTER_SHEET}!A:ZZ`
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SOURCE_SHEET}!A:ZZ`
    })
  ]);

  const masterRows = masterRes.data.values || [];
  const sourceRows = sourceRes.data.values || [];

  if (masterRows.length === 0) {
    throw new Error(`La hoja ${MASTER_SHEET} no tiene encabezados.`);
  }

  if (sourceRows.length === 0) {
    throw new Error(`La hoja ${SOURCE_SHEET} no tiene encabezados.`);
  }

  const masterHeaders = masterRows[0];
  const sourceHeaders = sourceRows[0];

  const masterMap = buildHeaderMap(masterHeaders);
  const sourceMap = buildHeaderMap(sourceHeaders);

  const requiredInBoth = [
    "frase_original",
    "frase_corregida",
    "caption",
    "post_tipo",
    "modo",
    "background_color",
    "carousel_id",
    "carousel_order",
    "carousel_caption"
  ];

  for (const key of requiredInBoth) {
    if (masterMap[key] === undefined) {
      throw new Error(`Falta la columna ${key} en ${MASTER_SHEET}`);
    }
    if (sourceMap[key] === undefined) {
      throw new Error(`Falta la columna ${key} en ${SOURCE_SHEET}`);
    }
  }

  const existingPhrases = new Set();

  for (let i = 1; i < masterRows.length; i++) {
    const phrase = getComparablePhrase(masterRows[i], masterMap);
    if (phrase) {
      existingPhrases.add(phrase);
    }
  }

  const rowsToAppend = [];
  const migratedSourceRowIndexes = [];
  const batchSeen = new Set();

  for (let i = 1; i < sourceRows.length; i++) {
    const sourceRow = sourceRows[i];
    const phrase = getComparablePhrase(sourceRow, sourceMap);

    if (!phrase) {
      continue;
    }

    if (existingPhrases.has(phrase) || batchSeen.has(phrase)) {
      continue;
    }

    const newRow = makeEmptyRow(masterHeaders.length);
    const now = new Date().toISOString();

    // Copiar contenido base
    setValue(newRow, masterMap, "frase_original", sourceRow[sourceMap["frase_original"]] || "");
    setValue(newRow, masterMap, "frase_corregida", sourceRow[sourceMap["frase_corregida"]] || "");
    setValue(newRow, masterMap, "caption", sourceRow[sourceMap["caption"]] || "");
    setValue(newRow, masterMap, "post_tipo", sourceRow[sourceMap["post_tipo"]] || "single");
    setValue(newRow, masterMap, "modo", sourceRow[sourceMap["modo"]] || "retro3d");
    setValue(newRow, masterMap, "background_color", sourceRow[sourceMap["background_color"]] || "");
    setValue(newRow, masterMap, "carousel_id", sourceRow[sourceMap["carousel_id"]] || "");
    setValue(newRow, masterMap, "carousel_order", sourceRow[sourceMap["carousel_order"]] || "");
    setValue(newRow, masterMap, "carousel_caption", sourceRow[sourceMap["carousel_caption"]] || "");

    // Metadata base
    const rowIdPrefix =
      normalizeText(sourceRow[sourceMap["post_tipo"]]) === "carousel" ? "carousel" : "single";
    const rowId = `${rowIdPrefix}-${Date.now()}-${i}`;

    setValue(newRow, masterMap, "row_id", rowId);
    setValue(newRow, masterMap, "created_at", now);
    setValue(newRow, masterMap, "updated_at", now);

    // Estados iniciales
    setValue(newRow, masterMap, "estado_general", "pending");
    setValue(newRow, masterMap, "estado_render", "pending");
    setValue(newRow, masterMap, "estado_upload", "pending");
    setValue(newRow, masterMap, "estado_publish", "pending");
    setValue(newRow, masterMap, "lock_status", "free");
    setValue(newRow, masterMap, "intentos", "0");

    // Limpiar trazabilidad técnica
    setValue(newRow, masterMap, "last_cycle_id", "");
    setValue(newRow, masterMap, "error_step", "");
    setValue(newRow, masterMap, "error_message", "");
    setValue(newRow, masterMap, "output_file", "");
    setValue(newRow, masterMap, "output_path", "");
    setValue(newRow, masterMap, "fecha_generado", "");
    setValue(newRow, masterMap, "media_url", "");
    setValue(newRow, masterMap, "cloudinary_public_id", "");
    setValue(newRow, masterMap, "fecha_upload", "");
    setValue(newRow, masterMap, "instagram_creation_id", "");
    setValue(newRow, masterMap, "instagram_media_id", "");
    setValue(newRow, masterMap, "facebook_photo_id", "");
    setValue(newRow, masterMap, "facebook_post_id", "");
    setValue(newRow, masterMap, "post_id", "");
    setValue(newRow, masterMap, "fecha_publicado", "");

    rowsToAppend.push(newRow);
    migratedSourceRowIndexes.push(i + 1);
    batchSeen.add(phrase);
    existingPhrases.add(phrase);
  }

  if (rowsToAppend.length === 0) {
    console.log("No se encontraron filas nuevas para migrar.");
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${MASTER_SHEET}!A:ZZ`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rowsToAppend
    }
  });

  console.log(`Se agregaron ${rowsToAppend.length} filas nuevas a ${MASTER_SHEET}.`);

  // Marcar en Hoja2 las filas migradas
  const sourceStatusColIndex = sourceMap["estado_general"];
  const sourceUpdatedAtColIndex = sourceMap["updated_at"];

  if (sourceStatusColIndex !== undefined || sourceUpdatedAtColIndex !== undefined) {
    const updates = [];

    for (const rowNumber of migratedSourceRowIndexes) {
      if (sourceStatusColIndex !== undefined) {
        updates.push({
          range: `${SOURCE_SHEET}!${columnToLetter(sourceStatusColIndex + 1)}${rowNumber}`,
          values: [["migrated"]]
        });
      }

      if (sourceUpdatedAtColIndex !== undefined) {
        updates.push({
          range: `${SOURCE_SHEET}!${columnToLetter(sourceUpdatedAtColIndex + 1)}${rowNumber}`,
          values: [[new Date().toISOString()]]
        });
      }
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updates
        }
      });
    }
  }

  console.log(`Se marcaron ${migratedSourceRowIndexes.length} filas en ${SOURCE_SHEET} como migrated.`);
}

function columnToLetter(column) {
  let temp = "";
  let letter = "";

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}

main().catch((error) => {
  console.error("Error migrando frases:", error);
  process.exit(1);
});