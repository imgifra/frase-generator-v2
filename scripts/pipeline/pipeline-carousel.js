require("dotenv").config();

const { sleep, validateWaitMs } = require("../utils/pipeline-utils");
const { logger } = require("../utils/logger");
const { runCarouselPipeline } = require("./run-carousel");

const WAIT_MS = Number(process.env.WAIT_MS || 2 * 60 * 60 * 1000);

validateWaitMs(WAIT_MS);

async function main() {
  const mainLogger = logger.child({
    pipeline: "CAROUSEL_RUNNER",
    waitMs: WAIT_MS
  });

  mainLogger.info("Pipeline carousel activo", {
    waitSeconds: Math.round(WAIT_MS / 1000)
  });

  while (true) {
    const cycleId = `${Date.now()}`;

    try {
      runCarouselPipeline({
        cycleId,
        branch: "carousel_runner"
      });
    } catch (error) {
      mainLogger.error("Error no controlado en pipeline carousel", { cycleId }, error);
    }

    mainLogger.info("Esperando próximo ciclo", {
      cycleId,
      waitSeconds: Math.round(WAIT_MS / 1000)
    });

    await sleep(WAIT_MS);
  }
}

main().catch((error) => {
  logger.error("Error fatal al iniciar pipeline carousel", {}, error);
  process.exit(1);
});