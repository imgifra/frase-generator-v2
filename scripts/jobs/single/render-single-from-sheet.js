require("dotenv").config();

const { renderPhrase } = require("../../libs/render-lib");
const {
  getSheetsClient,
  buildHeaderMap,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");
const { normalizeValue, nowIsoLocal } = require("../../utils/common");
const { ESTADOS, POST_TIPOS } = require("../../config/constants");

const BG_SEQUENCE = [
  "#f4c400", // retroYellow
  "#3d5afe", // retroBlue
  "#e53935", // retroRed
  "#f6f1e8", // retroWhite
  "#0d0f14"  // retroBlack
];

function getLastPublishedBg(rows, headerMap) {
  const estadoCol = headerMap["estado"];
  const bgCol = headerMap["bg"];
  const fechaPublicadoCol = headerMap["fecha_publicado"];
  const postTipoCol = headerMap["post_tipo"];

  if (
    estadoCol === undefined ||
    bgCol === undefined ||
    fechaPublicadoCol === undefined ||
    postTipoCol === undefined
  ) {
    return "";
  }

  let latestBg = "";
  let latestTime = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const estado = normalizeValue(row[estadoCol]);
    const bg = normalizeValue(row[bgCol]);
    const fechaPublicado = normalizeValue(row[fechaPublicadoCol]);
    const postTipo = normalizeValue(row[postTipoCol]);

    if (
      estado !== ESTADOS.PUBLICADO ||
      postTipo !== POST_TIPOS.SINGLE ||
      !bg ||
      !fechaPublicado
    ) {
      continue;
    }

    const timestamp = Date.parse(fechaPublicado);

    if (Number.isNaN(timestamp)) {
      continue;
    }

    if (timestamp > latestTime) {
      latestTime = timestamp;
      latestBg = bg.toLowerCase();
    }
  }

  return latestBg;
}

function getNextColor(color) {
  if (!color) return BG_SEQUENCE[0];

  const index = BG_SEQUENCE.findIndex(
    (item) => item.toLowerCase() === color.toLowerCase()
  );

  if (index === -1) return BG_SEQUENCE[0];

  return BG_SEQUENCE[(index + 1) % BG_SEQUENCE.length];
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
    "frase_original",
    "frase_corregida",
    "modo",
    "bg",
    "estado",
    "post_tipo",
    "output_file",
    "fecha_generado",
    "fecha_publicado",
    "error"
  ];

  for (const key of requiredHeaders) {
    if (!(key in headerMap)) {
      throw new Error(`Falta la columna requerida: ${key}`);
    }
  }

  let selectedRow = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const estado = normalizeValue(row[headerMap["estado"]]);
    const postTipo = normalizeValue(row[headerMap["post_tipo"]]);

    if (
      estado === ESTADOS.LISTA_PARA_RENDER &&
      postTipo === POST_TIPOS.SINGLE
    ) {
      selectedRow = {
        rowNumber: i + 1,
        values: row
      };
      break;
    }
  }

  if (!selectedRow) {
    console.log(`No hay singles con estado "${ESTADOS.LISTA_PARA_RENDER}".`);
    process.exit(10);
  }

  const rowNumber = selectedRow.rowNumber;
  const row = selectedRow.values;

  const fraseOriginal = normalizeValue(row[headerMap["frase_original"]]);
  const fraseCorregida = normalizeValue(row[headerMap["frase_corregida"]]);
  const mode = normalizeValue(row[headerMap["modo"]]) || "retro3d";
  const textToRender = fraseCorregida || fraseOriginal;

  if (!textToRender) {
    throw new Error(`La fila ${rowNumber} no tiene frase para renderizar.`);
  }

  const lastPublishedBg = getLastPublishedBg(rows, headerMap);
  const bg = getNextColor(lastPublishedBg);

  console.log(`Renderizando fila ${rowNumber}`);
  console.log(`Texto: ${textToRender}`);
  console.log(`Modo: ${mode}`);
  console.log(`Color: ${bg}`);

  await updateCellsBatch(sheets, [
    {
      row: rowNumber,
      col: headerMap["estado"] + 1,
      value: ESTADOS.PROCESANDO_RENDER
    },
    {
      row: rowNumber,
      col: headerMap["bg"] + 1,
      value: bg
    },
    {
      row: rowNumber,
      col: headerMap["error"] + 1,
      value: ""
    }
  ]);

  try {
    const result = await renderPhrase({
      text: textToRender,
      mode,
      bg
    });

    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["output_file"] + 1,
        value: result.fileName
      },
      {
        row: rowNumber,
        col: headerMap["fecha_generado"] + 1,
        value: nowIsoLocal()
      },
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: ESTADOS.RENDERIZADO
      },
      {
        row: rowNumber,
        col: headerMap["error"] + 1,
        value: ""
      }
    ]);

    console.log(`Fila ${rowNumber} renderizada correctamente.`);
    console.log(`Archivo: ${result.fileName}`);
  } catch (error) {
    await updateCellsBatch(sheets, [
      {
        row: rowNumber,
        col: headerMap["estado"] + 1,
        value: ESTADOS.ERROR_RENDER
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
  console.error("Error en render-single-from-sheet:", err);
  process.exit(1);
});