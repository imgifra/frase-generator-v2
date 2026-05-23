const { getCellValue } = require("../core/sheets");
const { STATUS, GENERAL_STATUS } = require("../core/status");
const { RETRO_PALETTES } = require("../libs/retro-palettes");

const RANDOM_HISTORY_SIZE = 6;

const SIMILAR_PALETTE_GROUPS = [
  // Claros / crema / pastel suave
  ["retroWhite", "retroAsh", "retroMint", "retroSky", "retroBabyPink"],

  // Oscuros casi negros
  ["retroBlack", "retroWine", "retroCoffee", "retroNeon", "retroGrayDark"],

  // Azules / navy / slate
  ["retroBlue", "retroNavy", "retroSlate", "retroSkyDeep", "retroLavender"],

  // Rojos / naranjas / tierra
  ["retroRed", "retroOrange", "retroTerra", "retroCrimson"],

  // Amarillos / mostaza
  ["retroYellow", "retroMustard"],

  // Verdes / oliva / forest / teal / lime
  ["retroGreen", "retroForest", "retroOlive", "retroTeal", "retroLime"],

  // Morados / vino / rosa fuerte
  ["retroPurple", "retroPlum", "retroWine", "retroPink", "retroCrimson"],

  // Cafés / tostados / tierra
  ["retroCoffee", "retroToasted", "retroTerra", "retroMustard"],

  // Neón / alto contraste
  ["retroBlack", "retroNeon", "retroLime", "retroTeal"]
];

const PALETTES_IN_CYCLE = RETRO_PALETTES.filter(p => p.inCycle !== false);

const PALETTE_BY_BG = new Map(
  PALETTES_IN_CYCLE.map(p => [p.bg.toLowerCase(), p])
);

const SIMILAR_PALETTE_MAP = buildSimilarPaletteMap(SIMILAR_PALETTE_GROUPS);

function buildSimilarPaletteMap(groups) {
  const map = new Map();

  for (const group of groups) {
    for (const id of group) {
      if (!map.has(id)) {
        map.set(id, new Set());
      }

      for (const otherId of group) {
        if (otherId !== id) {
          map.get(id).add(otherId);
        }
      }
    }
  }

  return map;
}

function getPaletteIdByBg(bg) {
  const normalizedBg = (bg || "").toLowerCase().trim();
  return PALETTE_BY_BG.get(normalizedBg)?.id || "";
}

function areSimilarPalettes(candidateBg, recentBg) {
  const candidateId = getPaletteIdByBg(candidateBg);
  const recentId    = getPaletteIdByBg(recentBg);

  if (!candidateId || !recentId) return false;
  if (candidateId === recentId) return true;

  return SIMILAR_PALETTE_MAP.get(recentId)?.has(candidateId) || false;
}

/**
 * Devuelve los últimos colores usados entre:
 * - Posts publicados
 * - Posts en vuelo: render done pero publish pending/error/processing
 *
 * Trata cada carrusel como una sola publicación, para que sus slides no llenen
 * todo el historial con el mismo color.
 */
function getRecentUsedBgs(rows, headerMap, limit = RANDOM_HISTORY_SIZE) {
  const posts = new Map();

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
        estadoPublish === STATUS.PENDING ||
        estadoPublish === STATUS.ERROR ||
        estadoPublish === STATUS.PROCESSING
      );

    if (!isPublished && !isInFlight) continue;

    const fechaRef = isPublished
      ? getCellValue(row, headerMap, "fecha_publicado")
      : getCellValue(row, headerMap, "fecha_generado");

    if (!fechaRef) continue;

    const timestamp = Date.parse(fechaRef);
    if (Number.isNaN(timestamp)) continue;

    const carouselId = getCellValue(row, headerMap, "carousel_id");
    const postKey = postTipo === "carousel" && carouselId
      ? `carousel:${carouselId}`
      : `single:${i}`;

    const existing = posts.get(postKey);

    if (!existing || timestamp > existing.timestamp) {
      posts.set(postKey, {
        bg: bg.toLowerCase().trim(),
        timestamp
      });
    }
  }

  return [...posts.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map(item => item.bg);
}

/**
 * Elige un color aleatorio evitando:
 * - el mismo color exacto
 * - colores de una familia visual parecida
 * dentro de los últimos N posts.
 */
function getRandomColorAvoidingSimilar(recentBgs = []) {
  const recent = recentBgs
    .map(bg => (bg || "").toLowerCase().trim())
    .filter(Boolean)
    .slice(0, RANDOM_HISTORY_SIZE);

  let available = PALETTES_IN_CYCLE.filter(candidate => {
    return !recent.some(recentBg => areSimilarPalettes(candidate.bg, recentBg));
  });

  // Fallback 1: si bloqueó demasiado, al menos evita repetir exacto.
  if (!available.length) {
    available = PALETTES_IN_CYCLE.filter(candidate => {
      return !recent.includes(candidate.bg.toLowerCase());
    });
  }

  // Fallback 2: si aun así no hay nada, usa todo el pool.
  if (!available.length) {
    available = PALETTES_IN_CYCLE;
  }

  const chosen = available[Math.floor(Math.random() * available.length)];
  return chosen.bg;
}

/**
 * Compatibilidad con código viejo:
 * si alguna parte todavía llama getLastUsedBg o getRandomColorExcept,
 * no se rompe.
 */
function getLastUsedBg(rows, headerMap) {
  return getRecentUsedBgs(rows, headerMap, 1)[0] || "";
}

function getRandomColorExcept(lastColor) {
  return getRandomColorAvoidingSimilar([lastColor]);
}

module.exports = {
  getRecentUsedBgs,
  getRandomColorAvoidingSimilar,
  getLastUsedBg,
  getRandomColorExcept
};