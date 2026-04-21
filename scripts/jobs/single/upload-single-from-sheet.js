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
const { logger } = require("../../utils/logger");

const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "..", "output");

function findNextUploadRow(rows, headerMap) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const postTipo = normalizeValue(row[headerMap["post_tipo"]]).toLowerCase();
    const estadoRender = normalizeValue(
      row[headerMap["estado_render"]]
    ).toLowerCase();
    const estadoUpload = normalizeValue(
      row[headerMap["estado_upload"]]
    ).toLowerCase();
    const lockStatus = normalizeValue(row[headerMap["lock_status"]]).toLowerCase();

    const isEligible =
      postTipo === "single" &&
      estadoRender === "done" &&
      (estadoUpload === "pending" || estadoUpload === "error") &&
      lockStatus === "locked";

    if (isEligible) {
      return {
        rowNumber: i + 1,
        values: row
      };
    }
  }

  return null;
}

async function main() {
  const cycleId = process.env.PIPELINE_CYCLE_ID || "";
  const log = logger.child({
    job: "upload-single",
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
    "post_tipo",
    "estado_general",
    "estado_render",
    "estado_upload",
    "lock_status",
    "intentos",
    "last_cycle_id",
    "error_step",
    "error_message",
    "output_file",
    "media_url",
    "cloudinary_public_id",
    "fecha_upload"
  ];

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  const targetRow = findNextUploadRow(rows, headerMap);

  if (!targetRow) {
    log.info("No hay singles pendientes para upload");
    process.exit(10);
  }

  const rowNumber = targetRow.rowNumber;
  const row = targetRow.values;

  const rowId = normalizeValue(row[headerMap["row_id"]]);
  const outputFile = normalizeValue(row[headerMap["output_file"]]);
  const currentAttempts = Number(normalizeValue(row[headerMap["intentos"]]) || 0);

  const rowLogger = log.child({
    rowNumber,
    rowId,
    outputFile
  });

  if (!outputFile) {
    throw new Error(`La fila ${rowNumber} no tiene output_file.`);
  }

  const localPath = path.join(OUTPUT_DIR, outputFile);

  if (!fs.existsSync(localPath)) {
    throw new Error(`No existe el archivo local: ${localPath}`);
  }

  rowLogger.info("Fila seleccionada para upload", {
    localPath
  });

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado_upload"] + 1,
      value: "processing"
    },
    {
      row: rowNumber,
      col: headerMap["last_cycle_id"] + 1,
      value: cycleId
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

  try {
    const uploadResult = await uploadImage(localPath, outputFile);

    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
        rowLogger.info("Archivo local eliminado", {
          localPath
        });
      } catch (deleteErr) {
        rowLogger.warn("No se pudo eliminar el archivo local", {
          localPath
        }, deleteErr);
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
        col: headerMap["estado_upload"] + 1,
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

    rowLogger.info("Fila subida correctamente", {
      mediaUrl: uploadResult.secureUrl,
      publicId: uploadResult.publicId
    });
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "error"
      },
      {
        row: rowNumber,
        col: headerMap["estado_upload"] + 1,
        value: "error"
      },
      {
        row: rowNumber,
        col: headerMap["lock_status"] + 1,
        value: "free"
      },
      {
        row: rowNumber,
        col: headerMap["intentos"] + 1,
        value: currentAttempts + 1
      },
      {
        row: rowNumber,
        col: headerMap["error_step"] + 1,
        value: "upload"
      },
      {
        row: rowNumber,
        col: headerMap["error_message"] + 1,
        value: error.message || String(error)
      },
      {
        row: rowNumber,
        col: headerMap["updated_at"] + 1,
        value: nowIsoLocal()
      }
    ]);

    rowLogger.error("Error subiendo fila", {}, error);
    throw error;
  }
}

main().catch((err) => {
  logger.error("Error en upload-single-from-sheet", {}, err);
  process.exit(1);
});