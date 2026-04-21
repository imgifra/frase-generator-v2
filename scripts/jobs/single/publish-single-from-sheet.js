require("dotenv").config();

const { publishImagePost } = require("../../libs/instagram-lib");
const { publishFacebookImagePost } = require("../../libs/facebook-lib");
const { deleteImage } = require("../../libs/upload-lib");
const {
  getSheetsClient,
  buildHeaderMap,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");
const { normalizeValue, nowIsoLocal } = require("../../utils/common");
const { logger } = require("../../utils/logger");

function getPendingSingleRow(rows, headerMap) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const postTipo = normalizeValue(row[headerMap["post_tipo"]]).toLowerCase();
    const estadoRender = normalizeValue(
      row[headerMap["estado_render"]]
    ).toLowerCase();
    const estadoUpload = normalizeValue(
      row[headerMap["estado_upload"]]
    ).toLowerCase();
    const estadoPublish = normalizeValue(
      row[headerMap["estado_publish"]]
    ).toLowerCase();
    const lockStatus = normalizeValue(row[headerMap["lock_status"]]).toLowerCase();

    const isEligible =
      postTipo === "single" &&
      estadoRender === "done" &&
      estadoUpload === "done" &&
      (estadoPublish === "pending" || estadoPublish === "error") &&
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
    job: "publish-single",
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
    "caption",
    "media_url",
    "cloudinary_public_id",
    "post_id",
    "fecha_publicado",
    "estado_general",
    "estado_render",
    "estado_upload",
    "estado_publish",
    "lock_status",
    "intentos",
    "last_cycle_id",
    "error_step",
    "error_message",
    "instagram_creation_id",
    "instagram_media_id",
    "facebook_photo_id",
    "facebook_post_id"
  ];

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  const selectedRow = getPendingSingleRow(rows, headerMap);

  if (!selectedRow) {
    log.info("No hay singles pendientes para publish");
    process.exit(10);
  }

  const rowNumber = selectedRow.rowNumber;
  const row = selectedRow.values;

  const rowId = normalizeValue(row[headerMap["row_id"]]);
  const imageUrl = normalizeValue(row[headerMap["media_url"]]);
  const caption = normalizeValue(row[headerMap["caption"]]);
  const cloudinaryPublicId = normalizeValue(
    row[headerMap["cloudinary_public_id"]]
  );
  const currentAttempts = Number(normalizeValue(row[headerMap["intentos"]]) || 0);

  const rowLogger = log.child({
    rowNumber,
    rowId
  });

  if (!imageUrl) {
    throw new Error(`La fila ${rowNumber} no tiene media_url.`);
  }

  rowLogger.info("Fila seleccionada para publish", {
    hasCaption: Boolean(caption),
    imageUrl
  });

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado_publish"] + 1,
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
    },
    {
      row: rowNumber,
      col: headerMap["post_id"] + 1,
      value: ""
    },
    {
      row: rowNumber,
      col: headerMap["fecha_publicado"] + 1,
      value: ""
    }
  ]);

  try {
    const [instagramResult, facebookResult] = await Promise.all([
      publishImagePost({
        imageUrl,
        caption
      }),
      publishFacebookImagePost({
        imageUrl,
        caption
      })
    ]);

    const combinedPostId = JSON.stringify({
      instagram: {
        mediaId: instagramResult.mediaId || "",
        creationId: instagramResult.creationId || ""
      },
      facebook: {
        postId: facebookResult.postId || "",
        photoId: facebookResult.photoId || ""
      }
    });

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["instagram_creation_id"] + 1,
        value: instagramResult.creationId || ""
      },
      {
        row: rowNumber,
        col: headerMap["instagram_media_id"] + 1,
        value: instagramResult.mediaId || ""
      },
      {
        row: rowNumber,
        col: headerMap["facebook_photo_id"] + 1,
        value: facebookResult.photoId || ""
      },
      {
        row: rowNumber,
        col: headerMap["facebook_post_id"] + 1,
        value: facebookResult.postId || ""
      },
      {
        row: rowNumber,
        col: headerMap["post_id"] + 1,
        value: combinedPostId
      },
      {
        row: rowNumber,
        col: headerMap["fecha_publicado"] + 1,
        value: nowIsoLocal()
      },
      {
        row: rowNumber,
        col: headerMap["estado_publish"] + 1,
        value: "done"
      },
      {
        row: rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "published"
      },
      {
        row: rowNumber,
        col: headerMap["lock_status"] + 1,
        value: "free"
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

    rowLogger.info("Fila publicada correctamente", {
      instagramMediaId: instagramResult.mediaId || "",
      instagramCreationId: instagramResult.creationId || "",
      facebookPostId: facebookResult.postId || "",
      facebookPhotoId: facebookResult.photoId || ""
    });

    if (cloudinaryPublicId) {
      try {
        await deleteImage(cloudinaryPublicId);
        rowLogger.info("Asset de Cloudinary eliminado", {
          cloudinaryPublicId
        });
      } catch (deleteError) {
        rowLogger.warn(
          "No se pudo eliminar el asset de Cloudinary",
          {
            cloudinaryPublicId
          },
          deleteError
        );
      }
    }
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "error"
      },
      {
        row: rowNumber,
        col: headerMap["estado_publish"] + 1,
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
        value: "publish"
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

    rowLogger.error("Error publicando fila", {}, error);
    throw error;
  }
}

main().catch((err) => {
  logger.error("Error en publish-single-from-sheet", {}, err);
  process.exit(1);
});