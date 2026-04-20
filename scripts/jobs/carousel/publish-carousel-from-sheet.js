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
const { ESTADOS, POST_TIPOS } = require("../../config/constants");

function getPendingCarouselRows(rows, headerMap) {
  let selectedCarouselId = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);
    const estado = normalizeValue(row[headerMap["estado"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    if (
      postTipo === POST_TIPOS.CAROUSEL &&
      estado === ESTADOS.LISTA_PARA_PUBLICAR_CAROUSEL &&
      carouselId
    ) {
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
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);
    const estado = normalizeValue(row[headerMap["estado"]]);

    if (
      postTipo === POST_TIPOS.CAROUSEL &&
      carouselId === selectedCarouselId &&
      estado === ESTADOS.LISTA_PARA_PUBLICAR_CAROUSEL
    ) {
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
      `El carrusel ${selectedCarouselId} tiene carousel_order inválidos. Deben ser enteros mayores o iguales a 1.`
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
    const cloudinaryPublicId = normalizeValue(
      row[headerMap["cloudinary_public_id"]]
    );

    if (!mediaUrl) {
      throw new Error(`La fila ${item.rowNumber} no tiene media_url.`);
    }

    if (!carouselCaption && rowCaption) {
      carouselCaption = rowCaption;
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

async function deleteCarouselAssets(publicIds) {
  for (const item of publicIds) {
    if (!item.publicId) {
      continue;
    }

    try {
      await deleteImage(item.publicId);
      console.log(
        `Asset de Cloudinary eliminado para fila ${item.rowNumber}: ${item.publicId}`
      );
    } catch (deleteError) {
      console.warn(
        `No se pudo eliminar el asset de Cloudinary de la fila ${item.rowNumber}: ${item.publicId}`
      );
      console.warn(deleteError.message || deleteError);
    }
  }
}

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
    "post_tipo",
    "carousel_id",
    "carousel_order",
    "carousel_caption",
    "estado",
    "media_url",
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

  const { selectedCarouselId, groupRows } = getPendingCarouselRows(
    rows,
    headerMap
  );

  if (!selectedCarouselId) {
    console.log(
      `No hay carruseles con estado "${ESTADOS.LISTA_PARA_PUBLICAR_CAROUSEL}".`
    );
    process.exit(10);
  }

  validateCarouselRows(groupRows, selectedCarouselId);

  const { imageUrls, carouselCaption, publicIds } = buildCarouselPayload(
    groupRows,
    headerMap
  );

  console.log(
    `Publicando carrusel ${selectedCarouselId} con ${imageUrls.length} slides`
  );
  console.log(`Caption del carrusel: ${carouselCaption || "[sin caption]"}`);

  await updateCellsBatch(
    sheets,
    groupRows.flatMap((item) => [
      {
        row: item.rowNumber,
        col: headerMap["estado"] + 1,
        value: ESTADOS.PUBLICANDO_CAROUSEL
      },
      {
        row: item.rowNumber,
        col: headerMap["error"] + 1,
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

    await updateCellsBatch(
      sheets,
      groupRows.flatMap((item) => [
        {
          row: item.rowNumber,
          col: headerMap["post_id"] + 1,
          value: combinedPostId
        },
        {
          row: item.rowNumber,
          col: headerMap["fecha_publicado"] + 1,
          value: nowIsoLocal()
        },
        {
          row: item.rowNumber,
          col: headerMap["estado"] + 1,
          value: ESTADOS.PUBLICADO
        },
        {
          row: item.rowNumber,
          col: headerMap["error"] + 1,
          value: ""
        }
      ])
    );

    console.log(`Carrusel ${selectedCarouselId} publicado correctamente.`);
    console.log(`Instagram mediaId: ${instagramResult.mediaId}`);
    console.log(`Instagram creationId: ${instagramResult.creationId}`);
    console.log(`Facebook postId: ${facebookResult.postId}`);

    await deleteCarouselAssets(publicIds);
  } catch (error) {
    await updateCellsBatch(
      sheets,
      groupRows.flatMap((item) => [
        {
          row: item.rowNumber,
          col: headerMap["estado"] + 1,
          value: ESTADOS.ERROR_PUBLISH
        },
        {
          row: item.rowNumber,
          col: headerMap["error"] + 1,
          value: error.message || String(error)
        }
      ])
    );

    throw error;
  }
}

main().catch((err) => {
  console.error("Error en publish-carousel-from-sheet:", err);
  process.exit(1);
});