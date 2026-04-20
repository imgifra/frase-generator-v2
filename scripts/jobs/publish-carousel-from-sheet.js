require("dotenv").config();

const { google } = require("googleapis");
const { publishCarouselPost } = require("../libs/instagram-lib");
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

function getPendingCarouselRows(rows, headerMap) {
  let selectedCarouselId = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);
    const estado = normalizeValue(row[headerMap["estado"]]);
    const carouselId = normalizeValue(row[headerMap["carousel_id"]]);

    if (
      postTipo === "carousel" &&
      estado === "lista_para_publicar_carousel" &&
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
      postTipo === "carousel" &&
      carouselId === selectedCarouselId &&
      estado === "lista_para_publicar_carousel"
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
    console.log('No hay carruseles con estado "lista_para_publicar_carousel".');
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
        value: "publicando_instagram"
      },
      {
        row: item.rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ])
  );

  try {
    const result = await publishCarouselPost({
      imageUrls,
      caption: carouselCaption
    });

    await updateCellsBatch(
      sheets,
      groupRows.flatMap((item) => [
        {
          row: item.rowNumber,
          col: headerMap["post_id"] + 1,
          value: result.mediaId
        },
        {
          row: item.rowNumber,
          col: headerMap["fecha_publicado"] + 1,
          value: nowIsoLocal()
        },
        {
          row: item.rowNumber,
          col: headerMap["estado"] + 1,
          value: "publicado"
        },
        {
          row: item.rowNumber,
          col: headerMap["error"] + 1,
          value: ""
        }
      ])
    );

    console.log(`Carrusel ${selectedCarouselId} publicado correctamente.`);
    console.log(`Post ID: ${result.mediaId}`);
    console.log(`Creation ID: ${result.creationId}`);

    await deleteCarouselAssets(publicIds);
  } catch (error) {
    await updateCellsBatch(
      sheets,
      groupRows.flatMap((item) => [
        {
          row: item.rowNumber,
          col: headerMap["estado"] + 1,
          value: "error_publish"
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