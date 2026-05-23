const { getCellValue } = require("../core/sheets");
const { STATUS, GENERAL_STATUS, BG_SEQUENCE } = require("../core/status");

/**
 * Devuelve el color de fondo más reciente entre:
 * - Posts publicados (estado_general === published)
 * - Posts en vuelo (render done, publish aún pending/error/processing)
 *
 * Considera tanto singles como carruseles, y usa fecha_publicado
 * para publicados o fecha_generado para los en vuelo.
 *
 * Sirve para evitar repetir el color en el siguiente post.
 */
function getLastUsedBg(rows, headerMap) {
  let latestBg = "";
  let latestTime = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const postTipo      = getCellValue(row, headerMap, "post_tipo").toLowerCase();
    const bg            = getCellValue(row, headerMap, "background_color");
    const estadoGeneral = getCellValue(row, headerMap, "estado_general").toLowerCase();
    const estadoRender  = getCellValue(row, headerMap, "estado_render").toLowerCase();
    const estadoPublish = getCellValue(row, headerMap, "estado_publish").toLowerCase();

    if (!["single", "carousel"].includes(postTipo)) continue;
    if (!bg) continue;

    const isPublished = estadoGeneral === GENERAL_STATUS.PUBLISHED;

    const isInFlight =
      estadoRender === STATUS.DONE &&
      (
        estadoPublish === STATUS.PENDING    ||
        estadoPublish === STATUS.ERROR      ||
        estadoPublish === STATUS.PROCESSING
      );

    if (!isPublished && !isInFlight) continue;

    const fechaRef = isPublished
      ? getCellValue(row, headerMap, "fecha_publicado")
      : getCellValue(row, headerMap, "fecha_generado");

    if (!fechaRef) continue;

    const timestamp = Date.parse(fechaRef);
    if (Number.isNaN(timestamp)) continue;

    if (timestamp > latestTime) {
      latestTime = timestamp;
      latestBg   = bg.toLowerCase();
    }
  }

  return latestBg;
}

/**
 * Elige un color aleatorio de BG_SEQUENCE excluyendo el último usado.
 * Si solo hay un color disponible, lo retorna igual.
 */
function getRandomColorExcept(lastColor) {
  const normalizedLast = (lastColor || "").toLowerCase().trim();

  const available = BG_SEQUENCE.filter(
    (color) => color.toLowerCase() !== normalizedLast
  );

  if (!available.length) return BG_SEQUENCE[0];

  return available[Math.floor(Math.random() * available.length)];
}

module.exports = { getLastUsedBg, getRandomColorExcept };