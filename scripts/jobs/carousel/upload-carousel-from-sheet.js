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
const { normalizeValue } = require("../../utils/common");
const { ESTADOS, POST_TIPOS } = require("../../config/constants");

const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "..", "output");

async function main() {
  const sheets = await getSheetsClient();
  const rows = await readRows(sheets);

  if (rows.length < 2) {
    console.log("No hay datos.");
    return;
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);

  const requiredHeaders = [
    "estado",
    "post_tipo",
    "carousel_id",
    "carousel_order",
    "output_file",
    "media_url",
    "cloudinary_public_id",
    "error"
  ];

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  let selectedCarouselId = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const estado = normalizeValue(row[headerMap["estado"]]);
    const tipo = normalizeValue(row[headerMap["post_tipo"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    if (
      tipo === POST_TIPOS.CAROUSEL &&
      estado === ESTADOS.RENDERIZADO_CAROUSEL &&
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
      normalizeValue(row[headerMap["post_tipo"]]) === POST_TIPOS.CAROUSEL &&
      normalizeValue(row[headerMap["estado"]]) === ESTADOS.RENDERIZADO_CAROUSEL &&
      normalizeValue(row[headerMap["carousel_id"]]) === selectedCarouselId
    ) {
      groupRows.push({
        rowNumber: i + 1,
        values: row,
        order: Number(normalizeValue(row[headerMap["carousel_order"]]) || "0")
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

    const localPath = path.join(OUTPUT_DIR, fileName);

    if (!fs.existsSync(localPath)) {
      throw new Error(
        `No existe el archivo local para la fila ${rowNumber}: ${localPath}`
      );
    }

    console.log(`Subiendo slide ${item.order}: ${fileName}`);
    console.log(`Ruta local: ${localPath}`);

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: ESTADOS.SUBIENDO_CAROUSEL
      },
      {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ]);

    try {
      const result = await uploadImage(localPath, fileName);

      try {
        fs.unlinkSync(localPath);
        console.log(`Archivo local eliminado: ${localPath}`);
      } catch (deleteErr) {
        console.warn(`No se pudo eliminar el archivo local: ${localPath}`);
        console.warn(deleteErr.message || deleteErr);
      }

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
          value: ESTADOS.LISTA_PARA_PUBLICAR_CAROUSEL
        },
        {
          row: rowNumber,
          col: headerMap["error"] + 1,
          value: ""
        }
      ]);

      console.log(`Fila ${rowNumber} subida OK`);
    } catch (err) {
      await updateCellsBatch(sheets, [
        {
          row: rowNumber,
          col: headerMap["estado"] + 1,
          value: ESTADOS.ERROR_UPLOAD
        },
        {
          row: rowNumber,
          col: headerMap["error"] + 1,
          value: err.message || String(err)
        }
      ]);

      throw err;
    }
  }

  console.log("Carrusel subido completo.");
}

main().catch((err) => {
  console.error("Error en upload-carousel-from-sheet:", err);
  process.exit(1);
});