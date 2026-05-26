require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { SHEET_ID, getSheetsClient, buildHeaderMap } = require("../../core/sheets");
const { colToLetter, nowIsoLocal } = require("../../utils/common");
const { logger } = require("../../utils/logger");
const {
  splitEntries,
  scoreTweet,
  normalizeForScore,
  summarize
} = require("./curate-saved-tweets");
const { DEFAULT_GROUP, TAXONOMY, getTaxonomyMatch, normalizeGroupName } = require("./taxonomy");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_INPUT = path.join(ROOT, "data", "tweets-guardados-x.txt");

const WORKSHEET_NAME = process.env.SAVED_TWEETS_WORKSHEET_NAME || "archivo_x";
const INPUT_PATH = path.resolve(process.env.SAVED_TWEETS_INPUT || DEFAULT_INPUT);
const IMPORT_MODE = (process.env.SAVED_TWEETS_IMPORT_MODE || "all").toLowerCase();
const ONE_PER_LINE = parseBool(process.env.SAVED_TWEETS_ONE_PER_LINE, true);
const DRY_RUN = parseBool(process.env.SAVED_TWEETS_DRY_RUN, false);
const INCLUDE_RISKY = parseBool(process.env.SAVED_TWEETS_INCLUDE_RISKY, false);
const MIN_PRIORITY_SCORE = clampNumber(Number(process.env.SAVED_TWEETS_MIN_PRIORITY_SCORE || 55), 0, 100);
const IMPORT_LIMIT = clampNumber(Number(process.env.SAVED_TWEETS_IMPORT_LIMIT || 0), 0, 10000);

const HEADERS = [
  "sirve",
  "estado",
  "prioridad",
  "grupo_carrusel",
  "frase_final",
  "frase_original",
  "notas",
  "accion",
  "recomendacion_auto",
  "calidad",
  "riesgo",
  "temporada",
  "subtema",
  "clasificado_manual",
  "actualizado_en",
  "id",
  "fila_txt",
  "capturado_en",
  "lote_importacion"
];

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "si", "s"].includes(String(value).toLowerCase());
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function cell(row, headerMap, key) {
  const index = headerMap[key];
  if (index === undefined) return "";
  return String(row?.[index] || "").trim();
}

function cellFromAny(row, headerMap, keys) {
  for (const key of keys) {
    const value = cell(row, headerMap, key);
    if (value) return value;
  }

  return "";
}

function buildArchiveId(text) {
  const key = normalizeForScore(text);
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
  return `x_saved_${hash}`;
}

function getImportBatch() {
  return `x_saved_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
}

function getManualStatus(recommendation) {
  if (recommendation === "approved") return "pendiente";
  if (recommendation === "rewrite_needed") return "reescribir";
  if (recommendation === "seasonal") return "fecha";
  if (recommendation === "risky") return "revisar";
  return "descartada";
}

function getReadableRecommendation(recommendation) {
  if (recommendation === "approved") return "aprobada";
  if (recommendation === "rewrite_needed") return "reescribir";
  if (recommendation === "seasonal") return "fecha";
  if (recommendation === "risky") return "riesgo";
  return "rechazada";
}

function getReadableSeasonality(seasonality) {
  if (seasonality === "evergreen") return "vigente";
  if (seasonality === "seasonal") return "fecha";
  if (seasonality === "seasonal_event") return "evento";
  if (seasonality === "expired_or_contextual") return "caducada";
  return seasonality || "";
}

function getAutoVerdict(recommendation) {
  if (recommendation === "approved") return "si";
  if (recommendation === "rewrite_needed") return "reescribir";
  if (recommendation === "seasonal") return "fecha";
  if (recommendation === "risky") return "revisar";
  return "no";
}

function getEditorialPriority(row) {
  if (row.recommendation === "reject") return "descartar";
  if (row.recommendation === "approved" || row.quality_score >= 65) return "alta";
  if (row.quality_score >= 55) return "media";
  if (row.quality_score >= 45) return "baja";
  return "descartar";
}

function getTopicClassification(row) {
  const text = normalizeForScore(row.source_text);
  const taxonomyRule = getTaxonomyMatch(text);

  if (taxonomyRule) {
    return {
      topic: taxonomyRule.name,
      subtopic: taxonomyRule.subtopic
    };
  }

  return getFallbackTopic(row);

  const rules = [
    { topic: "Ex", subtopic: "ex como sujeto", pattern: /\b(mi ex|tu ex|su ex|el ex|la ex|un ex|una ex|exnovi[ao]|ex pareja|expareja|ex crush|ex casi algo)\b/ },
    { topic: "Vínculos confusos", subtopic: "ghosting / casi algo", pattern: /\b(casi algo|situationship|ghosting|ghoste\w*|me ghoste\w*|love bombing|lovebombing|contacto 0|contacto cero|se[nñ]ales mixtas|mixed signals|no me escribe|no me habla|me escribe|me responde|me deja en visto|en visto|migaj\w*|intermitente|aparece|desaparece|no sabe lo que quiere|no sabes lo que quieres|cuando me dice|te diria|te diría|me ilusion\w*)\b/ },
    { topic: "Desamor y tusa", subtopic: "dolor / duelo", pattern: /\b(tusa|desamor|duelo|extra[nñ]\w*|lo que extranas|lo que extrañas|duele|dol[io]\w*|dolor|romp\w* el corazon|corazon roto|llor\w*|despedida|perd[ií]|perderte|soltar|superar|me dolio|me dolió|me rompi|me romp[ií]|partida|ausencia|no nos perdimos|idealiz\w*)\b/ },
    { topic: "Sexo y cuerpo", subtopic: "sexo / cuerpo", pattern: /\b(sexo|coger|cog[ei]\w*|qliar|culiar|follar|chinga\w*|calenturient\w*|desnud\w*|cuca|culo|tetas|bolas|calzones|ropa puesta|me quito la ropa|sext\w*|cuerpo|cara|carita|carota|fisicamente|físicamente|tatuajes?|vape|pelo[s]? de la cuca)\b/ },
    { topic: "Coqueteo y deseo", subtopic: "flirteo / atraccion", pattern: /\b(coquet\w*|flirte\w*|ligue|crush|cita|beso|besar|arrunch\w*|deseo|ganas de verte|ganas de vernos|ganas de besarte|me gusta|gustas?|atracci[oó]n|conquist\w*|pretendient\w*|vernos|nos vemos|te quiero cerca|me interesas|quitarme la duda)\b/ },
    { topic: "Hombres", subtopic: "hombres como genero", pattern: /\b(hombres?|manes?|man\b|el bobo|un feo|feo hombre|heterosexual|p[eé]talo|caballer\w*|novio\b|cachorro|papi|se[nñ]or|ingeniero|m[eé]dico)\b/ },
    { topic: "Dinámica de pareja", subtopic: "relacion / reciprocidad", pattern: /\b(pareja|relaci[oó]n|novi[ao]s?|vincul\w*|reciprocidad|responsabilidad afectiva|celos|celosa|celoso|red flags?|red flag|t[oó]xic\w*|cacho|cachos|infiel|perdonar|perd[oó]n|novia|novio|permiso|trato|tratar|resuelva|resuelve|princess treatment|amor propio)\b/ },
    { topic: "Amor romántico", subtopic: "idealizacion / enamoramiento", pattern: /\b(amor romantico|amor romántico|amor\b|amar|enamor\w*|ilusion\w*|romantic\w*|idealiz\w*|querer amor|quiero enamorarme|me quiero enamorar|corazon|corazón|sentimiento|potencial|alma gemela|persona correcta|persona indicada|me gusta cuando)\b/ },
    { topic: "Actitud y autoestima", subtopic: "limites / orgullo", pattern: /\b(orgullo|estandares|estándares|autoestima|dignidad|limites|límites|prioridad|opcion|opción|independencia|no toler\w*|no me confundas|no me busques|no te busco|no me debes|no me pidas|me dio flojera|me da flojera|no respondo|no contesto|contestona|vulgaridad|callada|consejos?|alej\w*|no hay necesidad de forzar|no me haces falta|me haces ruido|me ubico mejor)\b/ },
    { topic: "Salud mental", subtopic: "ansiedad / existencial", pattern: /\b(salud mental|ansiedad|depresi[oó]n|terapia|psicolog\w*|traumas?|existencial|vacio|vacío|desmorona|estr[eé]s|estresad\w*|agotad\w*|cansancio|cansad\w*|domingo|lunes|miercoles|miércoles|semana|dormir|procrastin\w*|adultez|vida adulta|fluoxetina|clonazepam|tca|duelo)\b/ },
    { topic: "Universidad", subtopic: "vida universitaria", pattern: /\b(universidad|universitari\w*|facultad|semestre|parcial(?:es)?|profe|profesor\w*|clase|estudi\w*|carrera|uni\b|la u\b|syllabus|materia|apuntes|examen(?:es)?|matricula|matrícula)\b/ },
    { topic: "Plata y trabajo", subtopic: "plata / trabajo", pattern: /\b(plata|dinero|billete|sueldo|salario|gast\w*|taca[nñ]o|tarjeta|credito|crédito|compr\w*|pagar|cobrar|cobrame|cóbrame|qr|efectivo|quincena|deuda|trabaj\w*|chamb\w*|jefe|oficina|excel|entrevista|laboral|empleo|camello|contrato|prestacion de servicios|prestación de servicios|trabajador)\b/ },
    { topic: "Autorretrato y mood", subtopic: "yo / mood", pattern: /\b(yo\b|a mi\b|a mí\b|me siento|me senti|me sentí|amanec[ií]|estoy|soy|mi momento|mi version|mi versión|mi personalidad|mi defensa|mis contradicciones|yo si|yo sí|me pasa|me gusta manejar|ando|no se socializar|no sé socializar|estoy bien|soy un 10)\b/ },
    { topic: "Humor y Colombia", subtopic: "cotidiano / Colombia", pattern: /\b(bogota|bogotá|colombia|transmi|transmilenio|sitp|chapinero|tinto|trancon|trancón|pico y placa|bogotano|bogotana|medellin|medellín|parcero|nea|mor|mano|chimba|hpta|gonorrea|verga|mierda|pta|chisme|whatsapp|instagram|chatgpt|ia\b|normalicen|amigos|grupo|familia|gym|rumba|podcast|tiktok|close friends|\bcf\b|historia|like|la gente|uno\b|nadie\b|todo el mundo)\b/ }
  ];

  return rules.find(rule => rule.pattern.test(text)) || getFallbackTopic(row);
}

function getFallbackTopic(row) {
  const text = normalizeForScore(row.source_text);
  const normalizedTheme = normalizeGroupName(row.theme);
  const themeRule = TAXONOMY.find(rule => rule.name === normalizedTheme);

  if (themeRule) {
    return {
      topic: themeRule.name,
      subtopic: themeRule.subtopic
    };
  }

  if (/[¿?]/.test(row.source_text)) {
    return { topic: DEFAULT_GROUP, subtopic: "pregunta / conversación" };
  }

  if (/\byo\b|\bme\b|\bmi\b|\bsoy\b|\bestoy\b/.test(text)) {
    return { topic: "Autorretrato y mood", subtopic: "estado personal" };
  }

  if (/\bte\b|\btu\b|\busted\b|\bustedes\b/.test(text)) {
    return { topic: "Actitud, autoestima y límites", subtopic: "frase para alguien" };
  }

  return { topic: DEFAULT_GROUP, subtopic: "último recurso" };

  const themeFallbacks = {
    "Amor romántico": ["Amor romántico", "idealizacion / enamoramiento"],
    "Desamor y tusa": ["Desamor y tusa", "dolor / duelo"],
    "Ex": ["Ex", "ex como sujeto"],
    "Coqueteo y deseo": ["Coqueteo y deseo", "flirteo / atraccion"],
    "Vínculos confusos": ["Vínculos confusos", "ghosting / casi algo"],
    "Sexo y cuerpo": ["Sexo y cuerpo", "sexo / cuerpo"],
    "Hombres": ["Hombres", "hombres como genero"],
    "Dinámica de pareja": ["Dinámica de pareja", "relacion / reciprocidad"],
    "Actitud y autoestima": ["Actitud y autoestima", "limites / orgullo"],
    "Autorretrato y mood": ["Autorretrato y mood", "yo / mood"],
    "Salud mental": ["Salud mental", "ansiedad / existencial"],
    "Universidad": ["Universidad", "vida universitaria"],
    "Plata y trabajo": ["Plata y trabajo", "plata / trabajo"],
    "Humor y Colombia": ["Humor y Colombia", "cotidiano / Colombia"]
  };

  if (themeFallbacks[row.theme]) {
    const [topic, subtopic] = themeFallbacks[row.theme];
    return { topic, subtopic };
  }

  if (/[¿?]/.test(row.source_text)) {
    return { topic: "Humor y Colombia", subtopic: "pregunta / conversacion" };
  }

  if (/\buno\b|\bnadie\b|\btodo\b|\bsi\b.+\bentonces\b/.test(text)) {
    return { topic: "Humor y Colombia", subtopic: "observacion cotidiana" };
  }

  if (/\byo\b|\bme\b|\bmi\b|\bsoy\b|\bestoy\b/.test(text)) {
    return { topic: "Autorretrato y mood", subtopic: "estado personal" };
  }

  if (/\bte\b|\btu\b|\busted\b|\bustedes\b/.test(text)) {
    return { topic: "Actitud y autoestima", subtopic: "frase para alguien" };
  }

  if (/\bno\b|\bpero\b|\bporque\b/.test(text)) {
    return { topic: "Humor y Colombia", subtopic: "remate / contradiccion" };
  }

  return { topic: "Humor y Colombia", subtopic: "ultimo recurso" };
}

function getSeriesCandidate(row, topicInfo) {
  return topicInfo.topic;
}

function getCarouselPotential(groupName, groupCounts) {
  if (!groupName) return "no";
  const count = groupCounts.get(groupName) || 0;
  if (count >= 4) return "si";
  if (count >= 2) return "posible";
  return "no";
}

function getSuggestedAction(row, editorial) {
  if (row.recommendation === "approved") {
    return editorial.potencialCarrusel === "si"
      ? "revisar para carrusel o usar como single"
      : "puede pasar a single";
  }

  if (row.recommendation === "rewrite_needed") {
    return "reescribir en mona_version";
  }

  if (row.recommendation === "seasonal") {
    return "guardar para fecha o evento";
  }

  if (row.recommendation === "risky") {
    return "revisar riesgo antes de usar";
  }

  return "descartar salvo que quieras rescatar la idea";
}

function getEditorialClassification(row, groupCounts) {
  const topicInfo = getTopicClassification(row);
  const groupName = getSeriesCandidate(row, topicInfo);
  const potencialCarrusel = getCarouselPotential(groupName, groupCounts);
  const contentType = potencialCarrusel === "si" || potencialCarrusel === "posible"
    ? "carousel_candidate"
    : row.recommendation === "reject"
      ? "archive_only"
      : "single_candidate";

  const editorial = {
    sirveAuto: getAutoVerdict(row.recommendation),
    prioridadEditorial: getEditorialPriority(row),
    temaPrincipal: topicInfo.topic,
    subtema: topicInfo.subtopic,
    potencialCarrusel,
    grupoCarrusel: groupName,
    contentType,
    carouselGroup: groupName
  };

  editorial.accionSugerida = getSuggestedAction(row, editorial);
  return editorial;
}

function buildClassifiedRows(rows) {
  const provisional = rows.map(row => {
    const topicInfo = getTopicClassification(row);
    return {
      row,
      groupName: getSeriesCandidate(row, topicInfo)
    };
  });

  const groupCounts = new Map();
  for (const item of provisional) {
    if (!item.groupName) continue;
    groupCounts.set(item.groupName, (groupCounts.get(item.groupName) || 0) + 1);
  }

  return rows.map(row => ({
    ...row,
    editorial: getEditorialClassification(row, groupCounts)
  }));
}

function shouldImport(row) {
  if (IMPORT_MODE === "all") return true;
  if (IMPORT_MODE === "review") return row.recommendation !== "reject";

  if (row.recommendation === "approved") return true;
  if (row.recommendation === "seasonal") return true;
  if (row.recommendation === "rewrite_needed" && row.quality_score >= MIN_PRIORITY_SCORE) return true;
  if (INCLUDE_RISKY && row.recommendation === "risky" && row.quality_score >= MIN_PRIORITY_SCORE) return true;

  return false;
}

async function ensureWorksheet(sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "sheets.properties.title"
  });

  const exists = (meta.data.sheets || []).some(sheet => sheet.properties?.title === WORKSHEET_NAME);

  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: WORKSHEET_NAME
            }
          }
        }
      ]
    }
  });
}

async function readArchiveRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:AZ`
  }).catch(err => {
    if (err.code === 400 || err.code === 404) return { data: { values: [] } };
    throw err;
  });

  return res.data.values || [];
}

async function ensureHeaders(sheets, rows) {
  const currentHeaders = (rows[0] || []).map(header => String(header || "").trim());
  const existing = new Set(currentHeaders.filter(Boolean));
  const mergedHeaders = [...currentHeaders];

  for (const header of HEADERS) {
    if (!existing.has(header)) {
      mergedHeaders.push(header);
      existing.add(header);
    }
  }

  if (rows.length === 0 || mergedHeaders.length !== currentHeaders.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${WORKSHEET_NAME}!A1:${colToLetter(mergedHeaders.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [mergedHeaders]
      }
    });

    return [mergedHeaders, ...rows.slice(1)];
  }

  return rows;
}

function buildExistingIndexes(rows, headerMap) {
  const archiveIds = new Set();
  const textKeys = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const archiveId = cellFromAny(row, headerMap, ["id", "archive_id", "source_id"]);
    const textKey = normalizeForScore(cellFromAny(row, headerMap, ["frase_original", "source_text"]));

    if (archiveId) archiveIds.add(archiveId);
    if (textKey) textKeys.add(textKey);
  }

  return { archiveIds, textKeys };
}

function translateArchiveStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    pending: "pendiente",
    pending_review: "pendiente",
    needs_review: "revisar",
    review: "revisar",
    needs_rewrite: "reescribir",
    rewrite_needed: "reescribir",
    rewrite: "reescribir",
    ready: "listo",
    done: "listo",
    approved: "listo",
    rejected: "descartada",
    reject: "descartada",
    discarded: "descartada",
    seasonal: "fecha",
    risky: "revisar"
  };

  return map[normalized] || value;
}

function translateArchiveUse(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    yes: "si",
    true: "si",
    approved: "si",
    no: "no",
    false: "no",
    rejected: "no",
    reject: "no",
    needs_rewrite: "reescribir",
    rewrite_needed: "reescribir",
    rewrite: "reescribir",
    needs_review: "revisar",
    review: "revisar",
    seasonal: "fecha",
    risky: "revisar"
  };

  return map[normalized] || value;
}

function buildManualValues(rows, headerMap) {
  const byArchiveId = new Map();
  const byTextKey = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const archiveId = cellFromAny(row, headerMap, ["id", "archive_id", "source_id"]);
    const sourceText = cellFromAny(row, headerMap, ["frase_original", "source_text"]);
    const textKey = normalizeForScore(sourceText);
    const values = {
      frase_final: cellFromAny(row, headerMap, ["frase_final", "mona_version"]),
      notas: cellFromAny(row, headerMap, ["notas", "notes"]),
      estado: cellFromAny(row, headerMap, ["estado", "status"]),
      sirve: cellFromAny(row, headerMap, ["sirve", "sirve_auto"]),
      grupo_carrusel: cellFromAny(row, headerMap, ["grupo_carrusel", "carousel_group", "tema_principal"]),
      clasificado_manual: cellFromAny(row, headerMap, ["clasificado_manual"]),
      actualizado_en: cellFromAny(row, headerMap, ["actualizado_en"])
    };

    if (archiveId) byArchiveId.set(archiveId, values);
    if (textKey) byTextKey.set(textKey, values);
  }

  return { byArchiveId, byTextKey };
}

function applyManualValues(row, manualValues) {
  const archiveId = buildArchiveId(row.source_text);
  const textKey = normalizeForScore(row.source_text);
  const manual = manualValues.byArchiveId.get(archiveId) || manualValues.byTextKey.get(textKey) || {};

  return {
    ...row,
    frase_final: manual.frase_final || row.frase_final || "",
    notas: manual.notas || row.notas || "",
    estado: translateArchiveStatus(manual.estado || row.estado || ""),
    sirve: translateArchiveUse(manual.sirve || row.sirve || ""),
    grupo_carrusel: parseBool(manual.clasificado_manual, false)
      ? normalizeGroupName(manual.grupo_carrusel)
      : "",
    clasificado_manual: manual.clasificado_manual || "",
    actualizado_en: manual.actualizado_en || ""
  };
}

function archiveRowToSheetValues(row, headerMap, importBatch, capturedAt) {
  const width = Math.max(...Object.values(headerMap)) + 1;
  const values = Array(width).fill("");
  const editorial = row.editorial || getEditorialClassification(row, new Map());
  const archiveId = buildArchiveId(row.source_text);
  const manualGroup = parseBool(row.clasificado_manual, false) && row.grupo_carrusel
    ? row.grupo_carrusel
    : "";

  const set = (field, value) => {
    if (headerMap[field] !== undefined) {
      values[headerMap[field]] = value ?? "";
    }
  };

  set("id", archiveId);
  set("frase_original", row.source_text);
  set("frase_final", row.frase_final || row.mona_version || "");
  set("grupo_carrusel", manualGroup || editorial.grupoCarrusel);
  set("sirve", row.sirve || editorial.sirveAuto);
  set("prioridad", editorial.prioridadEditorial);
  set("estado", row.estado || getManualStatus(row.recommendation));
  set("accion", editorial.accionSugerida);
  set("notas", row.notas || row.notes || "");
  set("recomendacion_auto", getReadableRecommendation(row.recommendation));
  set("calidad", row.quality_score);
  set("riesgo", row.risk_score);
  set("temporada", getReadableSeasonality(row.seasonality));
  set("subtema", editorial.subtema);
  set("clasificado_manual", row.clasificado_manual || "");
  set("actualizado_en", row.actualizado_en || "");
  set("fila_txt", row.original_index);
  set("capturado_en", capturedAt);
  set("lote_importacion", importBatch);

  return values;
}

async function appendRows(sheets, headerMap, rows) {
  if (!rows.length) return;

  const capturedAt = nowIsoLocal();
  const importBatch = getImportBatch();
  const values = rows.map(row => archiveRowToSheetValues(row, headerMap, importBatch, capturedAt));
  const width = Math.max(...values.map(row => row.length), HEADERS.length);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:${colToLetter(width)}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values
    }
  });
}

async function rewriteArchiveRows(sheets, rows) {
  const capturedAt = nowIsoLocal();
  const importBatch = getImportBatch();
  const headerMap = buildHeaderMap(HEADERS);
  const values = [
    HEADERS,
    ...rows.map(row => archiveRowToSheetValues(row, headerMap, importBatch, capturedAt))
  ];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:BZ`
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values
    }
  });
}

function getAutoFieldValues(row) {
  const editorial = row.editorial || getEditorialClassification(row, new Map());
  const archiveId = buildArchiveId(row.source_text);

  return {
    archive_id: archiveId,
    source_id: archiveId,
    recommendation: row.recommendation,
    sirve_auto: editorial.sirveAuto,
    prioridad_editorial: editorial.prioridadEditorial,
    tema_principal: editorial.temaPrincipal,
    subtema: editorial.subtema,
    potencial_carrusel: editorial.potencialCarrusel,
    grupo_carrusel: editorial.grupoCarrusel,
    accion_sugerida: editorial.accionSugerida,
    theme: editorial.temaPrincipal,
    seasonality: row.seasonality,
    publish_window: row.publish_window,
    quality_score: row.quality_score,
    mona_fit_score: row.mona_fit_score,
    freshness_score: row.freshness_score,
    rewrite_potential: row.rewrite_potential,
    risk_score: row.risk_score,
    reason: row.reason,
    content_type: editorial.contentType,
    carousel_group: editorial.carouselGroup,
    original_index: row.original_index
  };
}

function buildScoredIndexes(rows) {
  const byArchiveId = new Map();
  const byTextKey = new Map();

  for (const row of rows) {
    const archiveId = buildArchiveId(row.source_text);
    const textKey = normalizeForScore(row.source_text);

    byArchiveId.set(archiveId, row);
    byTextKey.set(textKey, row);
  }

  return { byArchiveId, byTextKey };
}

function buildAutoUpdates(sheetRows, headerMap, scoredIndexes) {
  const updates = [];
  const fields = [
    "archive_id",
    "source_id",
    "recommendation",
    "sirve_auto",
    "prioridad_editorial",
    "tema_principal",
    "subtema",
    "potencial_carrusel",
    "grupo_carrusel",
    "accion_sugerida",
    "theme",
    "seasonality",
    "publish_window",
    "quality_score",
    "mona_fit_score",
    "freshness_score",
    "rewrite_potential",
    "risk_score",
    "reason",
    "content_type",
    "carousel_group",
    "original_index"
  ];

  for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex++) {
    const sheetRow = sheetRows[rowIndex];
    const archiveId = cell(sheetRow, headerMap, "archive_id");
    const textKey = normalizeForScore(cell(sheetRow, headerMap, "source_text"));
    const scoredRow = scoredIndexes.byArchiveId.get(archiveId) || scoredIndexes.byTextKey.get(textKey);

    if (!scoredRow) continue;

    const values = getAutoFieldValues(scoredRow);

    for (const field of fields) {
      const col = headerMap[field];
      if (col === undefined) continue;

      const nextValue = values[field] ?? "";
      const currentValue = String(sheetRow[col] ?? "");

      if (currentValue !== String(nextValue)) {
        updates.push({
          range: `${WORKSHEET_NAME}!${colToLetter(col + 1)}${rowIndex + 1}`,
          values: [[nextValue]]
        });
      }
    }
  }

  return updates;
}

async function updateAutoFields(sheets, updates) {
  if (!updates.length) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates
    }
  });
}

function summarizeGroups(rows) {
  const counts = {};

  for (const row of rows) {
    const group = row.editorial?.grupoCarrusel || "";
    if (!group) continue;
    counts[group] = (counts[group] || 0) + 1;
  }

  return counts;
}

function readAndScoreInput() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`No existe el archivo de entrada: ${INPUT_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const entries = splitEntries(raw, ONE_PER_LINE);
  const seen = new Set();
  const scored = [];
  let duplicateInFile = 0;

  entries.forEach((entry, index) => {
    const key = normalizeForScore(entry);
    if (!key) return;

    if (seen.has(key)) {
      duplicateInFile += 1;
      return;
    }

    seen.add(key);
    scored.push(scoreTweet(entry, index));
  });

  return {
    entries,
    scored: buildClassifiedRows(
      scored.sort((a, b) => b.quality_score - a.quality_score || a.original_index - b.original_index)
    ),
    duplicateInFile
  };
}

async function main() {
  const log = logger.child({ job: "import-saved-tweets", worksheet: WORKSHEET_NAME });

  if (!["priority", "review", "all"].includes(IMPORT_MODE)) {
    throw new Error("SAVED_TWEETS_IMPORT_MODE debe ser priority, review o all");
  }

  const { entries, scored, duplicateInFile } = readAndScoreInput();
  const selectedBeforeLimit = scored.filter(shouldImport);
  const selected = IMPORT_LIMIT ? selectedBeforeLimit.slice(0, IMPORT_LIMIT) : selectedBeforeLimit;

  log.info("Archivo X evaluado", {
    input: INPUT_PATH,
    read: entries.length,
    unique: scored.length,
    importMode: IMPORT_MODE,
    selected: selected.length,
    skippedByMode: scored.length - selectedBeforeLimit.length,
    duplicateInFile,
    summary: JSON.stringify(summarize(scored)),
    groups: JSON.stringify(summarizeGroups(scored)),
    dryRun: DRY_RUN
  });

  const sheets = await getSheetsClient();
  await ensureWorksheet(sheets);
  let rows = await readArchiveRows(sheets);
  rows = await ensureHeaders(sheets, rows);

  const headerMap = buildHeaderMap(rows[0]);
  const { archiveIds } = buildExistingIndexes(rows, headerMap);
  const manualValues = buildManualValues(rows, headerMap);
  const rowsToWrite = selected.map(row => applyManualValues(row, manualValues));

  if (!DRY_RUN) {
    await rewriteArchiveRows(sheets, rowsToWrite);
  }

  log.info("Archivo X importado al Sheet", {
    rowsWritten: DRY_RUN ? 0 : rowsToWrite.length,
    wouldWrite: DRY_RUN ? rowsToWrite.length : "",
    existingBeforeRewrite: archiveIds.size,
    worksheet: WORKSHEET_NAME
  });
}

main().catch(err => {
  logger.error("Error importando archivo X", {}, err);
  process.exit(1);
});
