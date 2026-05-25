require("dotenv").config();

const { logger } = require("../utils/logger");
const { runCarouselPipeline } = require("./run-carousel");
const { runSinglePipeline } = require("./run-single");
const { releaseStaleLocks } = require("../utils/pipeline-utils");
const {
  notifySuccess,
  notifyError,
  notifyNoPending,
  notifyStaleLocks,
  notifyFatal
} = require("../libs/telegram-lib");

function getTipoInput() {
  const raw = (process.env.TIPO_INPUT || "").trim().toLowerCase();

  if (!raw) return "auto";

  if (raw === "single" || raw === "carousel" || raw === "auto") return raw;

  throw new Error(
    `TIPO_INPUT inválido: "${process.env.TIPO_INPUT}". Usa "single", "carousel" o "auto".`
  );
}

async function runSingle({ cycleId, branch }) {
  return runSinglePipeline({ cycleId, branch });
}

async function runCarousel({ cycleId, branch, targetCarouselId }) {
  return runCarouselPipeline({ cycleId, branch, targetCarouselId });
}

async function runAuto({ cycleId, branch, targetCarouselId }) {
  const autoLogger = logger.child({ cycleId, mode: branch, tipo: "auto" });

  autoLogger.info("Modo auto iniciado. Se intentará primero CAROUSEL y luego SINGLE.");

  const carouselResult = await runCarousel({ cycleId, branch, targetCarouselId });

  if (!carouselResult.ok) {
    autoLogger.error("Modo auto detenido por error en CAROUSEL", carouselResult);
    return { ...carouselResult, autoTried: ["carousel"], failedBranch: "carousel" };
  }

  if (carouselResult.processed) {
    autoLogger.info("Modo auto procesó CAROUSEL", carouselResult);
    return { ...carouselResult, autoSelected: "carousel", autoTried: ["carousel"] };
  }

  autoLogger.info("Modo auto no encontró CAROUSEL procesable. Intentando SINGLE.", {
    carouselSkipped: true,
    carouselNoPending: Boolean(carouselResult.noPending)
  });

  const singleResult = await runSingle({ cycleId, branch });

  if (!singleResult.ok) {
    autoLogger.error("Modo auto detenido por error en SINGLE", singleResult);
    return { ...singleResult, autoTried: ["carousel", "single"], failedBranch: "single" };
  }

  if (singleResult.processed) {
    autoLogger.info("Modo auto procesó SINGLE", singleResult);
    return { ...singleResult, autoSelected: "single", autoTried: ["carousel", "single"] };
  }

  return {
    ok: true,
    processed: false,
    noPending: true,
    autoTried: ["carousel", "single"]
  };
}

async function main() {
  const startMs = Date.now();
  const cycleId = `${Date.now()}`;
  const isFormMode = process.env.FORM_MODE === "true";
  const branch = isFormMode ? "form" : "scheduled";
  const targetCarouselId = process.env.TARGET_CAROUSEL_ID || "";
  const tipo = getTipoInput();

  logger.info("Ejecutando pipeline una sola vez", {
    cycleId,
    mode: branch,
    tipo,
    targetCarouselId
  });

  // Liberar locks stale de ciclos anteriores y notificar si hubo
  const staleReleased = await releaseStaleLocks({ cycleId });
  if (staleReleased > 0) {
    await notifyStaleLocks({ filasLiberadas: staleReleased, cycleId });
  }

  let result;

  if (tipo === "single") {
    result = await runSingle({ cycleId, branch });
  } else if (tipo === "carousel") {
    result = await runCarousel({ cycleId, branch, targetCarouselId });
  } else {
    result = await runAuto({ cycleId, branch, targetCarouselId });
  }

  const durationMs = Date.now() - startMs;
  const tipoFinal  = result.autoSelected || tipo;

  // ── Notificaciones Telegram ──────────────────────────────────────────────
  if (!result.ok) {
    await notifyError({
      tipo:       tipoFinal,
      cycleId,
      failedStep: result.failedStep || result.failedBranch || "desconocido",
      durationMs
    });

    logger.error("Pipeline falló", result);
    process.exit(1);
  }

  if (result.processed) {
    await notifySuccess({
      tipo:      tipoFinal,
      cycleId,
      branch,
      recovered: Boolean(result.recoveredPending),
      durationMs
    });
  } else {
    // Solo notificar "sin pendientes" en modo scheduled para no spamear
    // cuando el formulario simplemente registra sin publicar
    if (branch === "scheduled") {
      await notifyNoPending({ cycleId, branch });
    }
  }

  logger.info("Pipeline completado", result);
  process.exit(0);
}

main().catch(async (error) => {
  logger.error("Error fatal", {}, error);

  await notifyFatal({
    cycleId:      `${Date.now()}`,
    errorMessage: error.message
  });

  process.exit(1);
});