require("dotenv").config();

const { publishCarouselPost } = require("../../libs/instagram-lib");
const { publishFacebookCarouselPost } = require("../../libs/facebook-lib");
const { deleteImage } = require("../../libs/upload-lib");
const {
  getSheetsClient,
  buildHeaderMap,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");
const { normalizeValue, nowIsoLocal } = require("../../utils/common");
const { logger } = require("../../utils/logger");

function getPendingCarouselRows(rows, headerMap) {
  let selectedCarouselId = "";

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
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    const isEligible =
      postTipo === "carousel" &&
      estadoRender === "done" &&
      estadoUpload === "done" &&
      (estadoPublish === "pending" || estadoPublish === "error") &&
      lockStatus === "locked" &&
      carouselId;

    if (isEligible) {
      selectedCarouselId = carouselId;
      break;
    }
  }

  if (!selectedCarouselId) {
    return { selectedCarouselId: "", groupRows: [] };
  }

  const groupRows = [];

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
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    const belongsToSelected =
      postTipo === "carousel" &&
      carouselId === selectedCarouselId &&
      estadoRender === "done" &&
      estadoUpload === "done" &&
      (estadoPublish === "pending" || estadoPublish === "error") &&
      lockStatus === "locked";

    if (belongsToSelected) {
      groupRows.push({
        rowNumber: i + 1,
        values: row,
        order: Number(normalizeValue(row[headerMap["carousel_order"]]) || "0")
      });
    }
  }

  groupRows.sort((a, b) => a.order - b.order);

  return { selectedCarouselId, groupRows };
}

function validateCarouselRows(groupRows, selectedCarouselId) {
  if (groupRows.length < 2 || groupRows.length > 10) {
    throw new Error(
      `El carrusel ${selectedCarouselId} tiene ${groupRows.length} slides. Debe tener entre 2 y 10.`
    );
  }

  const orders = groupRows.map((item) => item.order);

  if (orders.some((order) => !Number.isInteger(order) || order < 1)) {
    throw new Error(
      `El carrusel ${selectedCarouselId} tiene carousel_order inválidos. Deben ser enteros >= 1.`
    );
  }

  const uniqueOrders = new Set(orders);

  if (uniqueOrders.size !== orders.length) {
    throw new Error(
      `El carrusel ${selectedCarouselId} tiene carousel_order duplicados.`
    );
  }
}

function buildCarouselPayload(groupRows, headerMap) {
  const imageUrls = [];
  const publicIds = [];
  let carouselCaption = "";

  for (const item of groupRows) {
    const row = item.values;

    const mediaUrl = normalizeValue(row[headerMap["media_url"]]);
    const rowCaption = normalizeValue(row[headerMap["carousel_caption"]]);
    const fallbackCaption = normalizeValue(row[headerMap["caption"]]);
    const cloudinaryPublicId = normalizeValue(
      row[headerMap["cloudinary_public_id"]]
    );

    if (!mediaUrl) {
      throw new Error(`La fila ${item.rowNumber} no tiene media_url.`);
    }

    if (!carouselCaption && rowCaption) {
      carouselCaption = rowCaption;
    }

    if (!carouselCaption && fallbackCaption) {
      carouselCaption = fallbackCaption;
    }

    imageUrls.push(mediaUrl);
    publicIds.push({
      rowNumber: item.rowNumber,
      publicId: cloudinaryPublicId
    });
  }

  return {
    imageUrls,
    carouselCaption,
    publicIds
  };
}

async function deleteCarouselAssets(publicIds, groupLogger) {
  for (const item of publicIds) {
    if (!item.publicId) {
      continue;
    }

    try {
      await deleteImage(item.publicId);
      groupLogger.info("Asset de Cloudinary eliminado", {
        rowNumber: item.rowNumber,
        cloudinaryPublicId: item.publicId
      });
    } catch (deleteError) {
      groupLogger.warn(
        "No se pudo eliminar el asset de Cloudinary",
        {
          rowNumber: item.rowNumber,
          cloudinaryPublicId: item.publicId
        },
        deleteError
      );
    }
  }
}

async function markGroupAsError(sheets, headerMap, groupRows, errorMessage, attemptsDelta = 1) {
  const now = nowIsoLocal();
  const updates = [];

  for (const item of groupRows) {
    const row = item.values;
    const currentAttempts = Number(normalizeValue(row[headerMap["intentos"]]) || 0);

    updates.push(
      {
        row: item.rowNumber,
        col: headerMap["estado_general"] + 1,
        value: "error"
      },
      {
        row: item.rowNumber,
        col: headerMap["estado_publish"] + 1,
        value: "error"
      },
      {
        row: item.rowNumber,
        col: headerMap["lock_status"] + 1,
        value: "free"
      },
      {
        row: item.rowNumber,
        col: headerMap["intentos"] + 1,
        value: currentAttempts + attemptsDelta
      },
      {
        row: item.rowNumber,
        col: headerMap["error_step"] + 1,
        value: "publish"
      },
      {
        row: item.rowNumber,
        col: headerMap["error_message"] + 1,
        value: errorMessage
      },
      {
        row: item.rowNumber,
        col: headerMap["updated_at"] + 1,
        value: now
      }
    );
  }

  await updateCellsBatch(sheets, updates);
}

async function main() {
  const cycleId = process.env.PIPELINE_CYCLE_ID || "";
  const log = logger.child({
    job: "publish-carousel",
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
    "carousel_id",
    "carousel_order",
    "carousel_caption",
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

  const { selectedCarouselId, groupRows } = getPendingCarouselRows(
    rows,
    headerMap
  );

  if (!selectedCarouselId) {
    log.info("No hay carruseles pendientes para publish");
    process.exit(10);
  }

  validateCarouselRows(groupRows, selectedCarouselId);

  const { imageUrls, carouselCaption, publicIds } = buildCarouselPayload(
    groupRows,
    headerMap
  );

  const groupLogger = log.child({
    carouselId: selectedCarouselId,
    slides: groupRows.length
  });

  groupLogger.info("Carrusel seleccionado para publish", {
    hasCaption: Boolean(carouselCaption)
  });

  await updateCellsBatch(
    sheets,
    groupRows.flatMap((item) => [
      {
        row: item.rowNumber,
        col: headerMap["estado_publish"] + 1,
        value: "processing"
      },
      {
        row: item.rowNumber,
        col: headerMap["last_cycle_id"] + 1,
        value: cycleId
      },
      {
        row: item.rowNumber,
        col: headerMap["updated_at"] + 1,
        value: nowIsoLocal()
      },
      {
        row: item.rowNumber,
        col: headerMap["error_step"] + 1,
        value: ""
      },
      {
        row: item.rowNumber,
        col: headerMap["error_message"] + 1,
        value: ""
      },
      {
        row: item.rowNumber,
        col: headerMap["post_id"] + 1,
        value: ""
      },
      {
        row: item.rowNumber,
        col: headerMap["fecha_publicado"] + 1,
        value: ""
      }
    ])
  );

  try {
    const [instagramResult, facebookResult] = await Promise.all([
      publishCarouselPost({
        imageUrls,
        caption: carouselCaption
      }),
      publishFacebookCarouselPost({
        imageUrls,
        caption: carouselCaption
      })
    ]);

    const combinedPostId = JSON.stringify({
      instagram: {
        mediaId: instagramResult.mediaId || "",
        creationId: instagramResult.creationId || "",
        childIds: instagramResult.childIds || []
      },
      facebook: {
        postId: facebookResult.postId || "",
        mediaFbids: facebookResult.mediaFbids || []
      }
    });

    const now = nowIsoLocal();

    await updateCellsBatch(
      sheets,
      groupRows.flatMap((item) => [
        {
          row: item.rowNumber,
          col: headerMap["instagram_creation_id"] + 1,
          value: instagramResult.creationId || ""
        },
        {
          row: item.rowNumber,
          col: headerMap["instagram_media_id"] + 1,
          value: instagramResult.mediaId || ""
        },
        {
          row: item.rowNumber,
          col: headerMap["facebook_post_id"] + 1,
          value: facebookResult.postId || ""
        },
        {
          row: item.rowNumber,
          col: headerMap["facebook_photo_id"] + 1,
          value: Array.isArray(facebookResult.mediaFbids)
            ? JSON.stringify(facebookResult.mediaFbids)
            : ""
        },
        {
          row: item.rowNumber,
          col: headerMap["post_id"] + 1,
          value: combinedPostId
        },
        {
          row: item.rowNumber,
          col: headerMap["fecha_publicado"] + 1,
          value: now
        },
        {
          row: item.rowNumber,
          col: headerMap["estado_publish"] + 1,
          value: "done"
        },
        {
          row: item.rowNumber,
          col: headerMap["estado_general"] + 1,
          value: "published"
        },
        {
          row: item.rowNumber,
          col: headerMap["lock_status"] + 1,
          value: "free"
        },
        {
          row: item.rowNumber,
          col: headerMap["updated_at"] + 1,
          value: now
        },
        {
          row: item.rowNumber,
          col: headerMap["error_step"] + 1,
          value: ""
        },
        {
          row: item.rowNumber,
          col: headerMap["error_message"] + 1,
          value: ""
        }
      ])
    );

    groupLogger.info("Carrusel publicado correctamente", {
      instagramMediaId: instagramResult.mediaId || "",
      instagramCreationId: instagramResult.creationId || "",
      facebookPostId: facebookResult.postId || ""
    });

    await deleteCarouselAssets(publicIds, groupLogger);
  } catch (error) {
    await markGroupAsError(
      sheets,
      headerMap,
      groupRows,
      error.message || String(error)
    );

    groupLogger.error("Error publicando carrusel", {}, error);
    throw error;
  }
}

main().catch((err) => {
  logger.error("Error en publish-carousel-from-sheet", {}, err);
  process.exit(1);
});