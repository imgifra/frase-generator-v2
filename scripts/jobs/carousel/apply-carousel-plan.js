require("dotenv").config();

process.env.WORKSHEET_NAME = "Hoja 2";

const {
  getSheetsClient,
  buildHeaderMap,
  requireHeaders,
  getCellValue,
  readRows,
  updateCellsBatch
} = require("../../core/sheets");

const { nowIsoLocal } = require("../../utils/common");

const PLANS = [
  {
    carousel_id: "car_bog_transmi",
    ids: [297, 298, 299, 300, 301, 302, 303],
    caption: `Sobrevivientes del sistema`,
    hashtags: "#transmilenio #bogota #humor #colombia #frases #parati #real #viral"
  },
  {
    carousel_id: "car_bog_universidad",
    ids: [304, 305, 306, 307, 308, 309, 310, 311],
    caption: `Semestre tras semestre, ahí vamos`,
    hashtags: "#universidad #bogota #estudiantes #humor #colombia #frases #parati #real"
  },
  {
    carousel_id: "car_bog_clima",
    ids: [312, 313, 314, 315, 316, 317, 318],
    caption: `Abrigarse o no abrigarse, esa es la pregunta`,
    hashtags: "#bogota #frio #humor #colombia #frases #parati #real #viral"
  },
  {
    carousel_id: "car_bog_trancon",
    ids: [319, 320, 321, 322, 323, 324, 325],
    caption: `Moverse en Bogotá es un trabajo de tiempo completo`,
    hashtags: "#bogota #trancon #transmilenio #humor #colombia #frases #parati #real"
  },
  {
    carousel_id: "car_bog_rumba",
    ids: [326, 327, 328, 329, 330, 331, 332],
    caption: `Bogotá de noche es otro país`,
    hashtags: "#bogota #rumba #chapinero #humor #colombia #frases #parati #real"
  },
  {
    carousel_id: "car_bog_gomelos",
    ids: [333, 334, 335, 336],
    caption: `Bogotá tiene más capas que una cebolla`,
    hashtags: "#bogota #gomelos #humor #colombia #frases #parati #real #estrato"
  }
];

async function main() {
  const sheets = await getSheetsClient();
  const rows = await readRows(sheets);

  if (rows.length < 2) {
    console.log("No hay datos en Hoja 2.");
    return;
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);

  requireHeaders(headerMap, [
    "row_id",
    "updated_at",
    "post_tipo",
    "carousel_id",
    "carousel_order",
    "carousel_caption",
    "hashtags",
    "estado_general",
    "estado_render",
    "estado_upload",
    "estado_publish",
    "lock_status",
    "error_step",
    "error_message"
  ]);

  const rowById = new Map();

  for (let i = 1; i < rows.length; i++) {
    const rowId = getCellValue(rows[i], headerMap, "row_id");
    if (rowId) {
      rowById.set(String(rowId).trim(), {
        rowNumber: i + 1,
        values: rows[i]
      });
    }
  }

  const updates = [];
  const now = nowIsoLocal();

  for (const plan of PLANS) {
    console.log(`Aplicando ${plan.carousel_id}...`);

    plan.ids.forEach((id, index) => {
      const item = rowById.get(String(id));

      if (!item) {
        console.warn(`No encontré row_id ${id} para ${plan.carousel_id}`);
        return;
      }

      updates.push(
        { row: item.rowNumber, col: headerMap["post_tipo"] + 1, value: "carousel" },
        { row: item.rowNumber, col: headerMap["carousel_id"] + 1, value: plan.carousel_id },
        { row: item.rowNumber, col: headerMap["carousel_order"] + 1, value: index + 1 },
        { row: item.rowNumber, col: headerMap["carousel_caption"] + 1, value: plan.caption },
        { row: item.rowNumber, col: headerMap["hashtags"] + 1, value: plan.hashtags },
        { row: item.rowNumber, col: headerMap["estado_general"] + 1, value: "pending" },
        { row: item.rowNumber, col: headerMap["estado_render"] + 1, value: "pending" },
        { row: item.rowNumber, col: headerMap["estado_upload"] + 1, value: "pending" },
        { row: item.rowNumber, col: headerMap["estado_publish"] + 1, value: "pending" },
        { row: item.rowNumber, col: headerMap["lock_status"] + 1, value: "free" },
        { row: item.rowNumber, col: headerMap["error_step"] + 1, value: "" },
        { row: item.rowNumber, col: headerMap["error_message"] + 1, value: "" },
        { row: item.rowNumber, col: headerMap["updated_at"] + 1, value: now }
      );
    });
  }

  if (!updates.length) {
    console.log("No hay nada para actualizar.");
    return;
  }

  await updateCellsBatch(sheets, updates);

  console.log("Listo.");
  console.log(`Celdas actualizadas: ${updates.length}`);
  console.log(`Carruseles procesados: ${PLANS.length}`);
}

main().catch((error) => {
  console.error("Error aplicando plan de carruseles:");
  console.error(error);
  process.exit(1);
});