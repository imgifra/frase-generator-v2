const fs = require("fs");
require("dotenv").config();

const path = require("path");
const { uploadImage } = require("../../libs/upload-lib");
const {
  getSheetsClient,
  buildHeaderMap,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");
const { normalizeValue, nowIsoLocal } = require("../../utils/common");
const { ESTADOS, POST_TIPOS } = require("../../config/constants");

const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "..", "output");

async function main() {
  const sheets = await getSheetsClient();
  const rows = await readRows(sheets);

  if (rows.length < 2) {
    console.log("No hay datos en la hoja.");
    return;
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);

  const requiredHeaders = [
    "estado",
    "post_tipo",
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
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);

    if (
      estado === ESTADOS.RENDERIZADO &&
      postTipo === POST_TIPOS.SINGLE
    ) {
      targetRow = {
        rowNumber: i + 1,
        values: row
      };
      break;
    }
  }

  if (!targetRow) {
    console.log(`No hay singles con estado "${ESTADOS.RENDERIZADO}".`);
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
      value: ESTADOS.SUBIENDO_MEDIA
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
        value: ESTADOS.LISTA_PARA_PUBLICAR
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
        value: ESTADOS.ERROR_UPLOAD
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
  console.error("Error en upload-single-from-sheet:", err);
  process.exit(1);
});