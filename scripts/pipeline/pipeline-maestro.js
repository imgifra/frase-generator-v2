require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { sleep, validateWaitMs } = require("../utils/pipeline-utils");
const { logger } = require("../utils/logger");
const { runSinglePipeline } = require("./run-single");
const { runCarouselPipeline } = require("./run-carousel");

const WAIT_MS = Number(process.env.WAIT_MS || 15 * 60 * 1000);
const TIMEZONE = process.env.TIMEZONE || "America/Bogota";
const SLOT_FILE = path.join(__dirname, "..", "..", "data", "last-processed-slot.json");

validateWaitMs(WAIT_MS);

function readLastProcessedSlot() {
  try {
    const raw = fs.readFileSync(SLOT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.slot || "";
  } catch {
    return "";
  }
}

function writeLastProcessedSlot(slot) {
  try {
    const dir = path.dirname(SLOT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SLOT_FILE, JSON.stringify({ slot }), "utf8");
  } catch (err) {
    logger.warn("No se pudo guardar el slot procesado", { slot }, err);
  }
}

function getLocalHour() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    hour12: false
  });

  return Number(formatter.format(new Date()));
}

function getLocalDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function getRunWindow() {
  const hour = getLocalHour();

  const isPublishingHour = hour >= 6 && hour <= 22;
  const isEvenHour = hour % 2 === 0;
  const isCarouselHour = hour === 10 || hour === 18;

  if (!isPublishingHour || !isEvenHour) {
    return { type: null, hour };
  }

  if (isCarouselHour) {
    return { type: "carousel_preferred", hour };
  }

  return { type: "single", hour };
}

async function runMasterPipeline() {
  const cycleId = `${Date.now()}`;
  const startMs = Date.now();
  const windowInfo = getRunWindow();
  const dateKey = getLocalDateKey();

  const slotKey = windowInfo.type
    ? `${dateKey}-${windowInfo.hour}-${windowInfo.type}`
    : "";

  const cycleLogger = logger.child({
    cycleId,
    timezone: TIMEZONE,
    localHour: windowInfo.hour,
    slotKey
  });

  cycleLogger.info("Pipeline maestro iniciado", {
    windowType: windowInfo.type || "disabled"
  });

  if (!windowInfo.type) {
    cycleLogger.info("Hora no habilitada para publicación", {
      processed: false,
      durationMs: Date.now() - startMs
    });

    return { ok: true, processed: false, skipped: true };
  }

  const lastProcessedSlot = readLastProcessedSlot();

  if (slotKey === lastProcessedSlot) {
    cycleLogger.info("Ventana horaria ya procesada", {
      processed: false,
      durationMs: Date.now() - startMs
    });

    return { ok: true, processed: false, skipped: true };
  }

  if (windowInfo.type === "carousel_preferred") {
    cycleLogger.info("Ventana activa: carrusel preferido con fallback a single");

    const carouselResult = await runCarouselPipeline({
      cycleId,
      slotKey,
      branch: "carousel"
    });

    if (!carouselResult.ok) {
      cycleLogger.error("Falló la rama de carrusel", {
        failedBranch: "carousel",
        failedStep: carouselResult.failedStep,
        durationMs: Date.now() - startMs
      });

      return { ok: false, processed: false, failedBranch: "carousel" };
    }

    if (carouselResult.processed) {
      writeLastProcessedSlot(slotKey);

      cycleLogger.info("Ciclo completado con carrusel", {
        resultType: "carousel",
        processed: true,
        durationMs: Date.now() - startMs
      });

      return { ok: true, processed: true, type: "carousel" };
    }

    cycleLogger.info("No había carrusel pendiente; intentando single de respaldo");

    const singleResult = await runSinglePipeline({
      cycleId,
      slotKey,
      branch: "single_fallback"
    });

    if (!singleResult.ok) {
      cycleLogger.error("Falló la rama single de respaldo", {
        failedBranch: "single",
        failedStep: singleResult.failedStep,
        durationMs: Date.now() - startMs
      });

      return { ok: false, processed: false, failedBranch: "single" };
    }

    if (singleResult.processed) {
      writeLastProcessedSlot(slotKey);
    }

    cycleLogger.info("Ciclo completado tras fallback", {
      resultType: "single_fallback",
      processed: singleResult.processed,
      durationMs: Date.now() - startMs
    });

    return {
      ok: true,
      processed: singleResult.processed,
      type: "single_fallback"
    };
  }

  if (windowInfo.type === "single") {
    cycleLogger.info("Ventana activa: solo single");

    const singleResult = await runSinglePipeline({
      cycleId,
      slotKey,
      branch: "single"
    });

    if (!singleResult.ok) {
      cycleLogger.error("Falló la rama single", {
        failedBranch: "single",
        failedStep: singleResult.failedStep,
        durationMs: Date.now() - startMs
      });

      return { ok: false, processed: false, failedBranch: "single" };
    }

    if (singleResult.processed) {
      writeLastProcessedSlot(slotKey);
    }

    cycleLogger.info("Ciclo completado con single", {
      resultType: "single",
      processed: singleResult.processed,
      durationMs: Date.now() - startMs
    });

    return { ok: true, processed: singleResult.processed, type: "single" };
  }

  cycleLogger.warn("Se alcanzó una rama no esperada", {
    processed: false,
    durationMs: Date.now() - startMs
  });

  return { ok: true, processed: false };
}

async function main() {
  const mainLogger = logger.child({
    timezone: TIMEZONE,
    waitMs: WAIT_MS
  });

  mainLogger.info("Pipeline maestro activo", {
    waitSeconds: Math.round(WAIT_MS / 1000),
    slotFile: SLOT_FILE
  });

  while (true) {
    try {
      await runMasterPipeline();
    } catch (error) {
      mainLogger.error("Error no controlado en el pipeline maestro", {}, error);
    }

    mainLogger.info("Esperando próximo ciclo", {
      waitSeconds: Math.round(WAIT_MS / 1000),
      waitMinutes: Number((WAIT_MS / 1000 / 60).toFixed(2))
    });

    await sleep(WAIT_MS);
  }
}

main().catch((error) => {
  logger.error("Error fatal al iniciar pipeline maestro", {}, error);
  process.exit(1);
});