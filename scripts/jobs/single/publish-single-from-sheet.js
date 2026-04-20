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
const { ESTADOS, POST_TIPOS } = require("../../config/constants");

function getPendingSingleRow(rows, headerMap) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const estado = normalizeValue(row[headerMap["estado"]]);
    const tipo = normalizeValue(row[headerMap["post_tipo"]]);

    if (
      estado === ESTADOS.LISTA_PARA_PUBLICAR &&
      tipo === POST_TIPOS.SINGLE
    ) {
      return {
        rowNumber: i + 1,
        values: row
      };
    }
  }

  return null;
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
    "estado",
    "post_tipo",
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

  const selectedRow = getPendingSingleRow(rows, headerMap);

  if (!selectedRow) {
    console.log(`No hay singles con estado "${ESTADOS.LISTA_PARA_PUBLICAR}".`);
    process.exit(10);
  }

  const rowNumber = selectedRow.rowNumber;
  const row = selectedRow.values;

  const imageUrl = normalizeValue(row[headerMap["media_url"]]);
  const caption = normalizeValue(row[headerMap["caption"]]);
  const cloudinaryPublicId = normalizeValue(
    row[headerMap["cloudinary_public_id"]]
  );

  if (!imageUrl) {
    throw new Error(`La fila ${rowNumber} no tiene media_url.`);
  }

  console.log(`Publicando fila ${rowNumber}`);
  console.log(`Image URL: ${imageUrl}`);
  console.log(`Caption: ${caption || "[sin caption]"}`);

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado"] + 1,
      value: ESTADOS.PUBLICANDO_IG_FB
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
    },
    {
      row: rowNumber,
      col: headerMap["error"] + 1,
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
        col: headerMap["estado"] + 1,
        value: ESTADOS.PUBLICADO
      },
      {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ]);

    console.log(`Fila ${rowNumber} publicada correctamente.`);
    console.log(`Instagram mediaId: ${instagramResult.mediaId}`);
    console.log(`Instagram creationId: ${instagramResult.creationId}`);
    console.log(`Facebook postId: ${facebookResult.postId}`);
    console.log(`Facebook photoId: ${facebookResult.photoId}`);

    if (cloudinaryPublicId) {
      try {
        await deleteImage(cloudinaryPublicId);
        console.log(`Asset de Cloudinary eliminado: ${cloudinaryPublicId}`);
      } catch (deleteError) {
        console.warn(
          `No se pudo eliminar el asset de Cloudinary: ${cloudinaryPublicId}`
        );
        console.warn(deleteError.message || deleteError);
      }
    }
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: ESTADOS.ERROR_PUBLISH
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