require("dotenv").config();

const { logger } = require("../utils/logger");
const { runCarouselPipeline } = require("./run-carousel");

async function main() {
  const carouselId = process.env.TARGET_CAROUSEL_ID;

  const log = logger.child({ pipeline: "RUN_NOW", carouselId });

  if (!carouselId) {
    log.error("Falta TARGET_CAROUSEL_ID");
    process.exit(1);
  }

  log.info("Publicando carrusel manual de inmediato");

  const result = await runCarouselPipeline({
    cycleId: `manual_${Date.now()}`,
    slotKey: `manual_${carouselId}`,
    branch: "manual",
    targetCarouselId: carouselId
  });

  if (!result.ok) {
    log.error("Pipeline falló", { failedStep: result.failedStep });
    process.exit(1);
  }

  log.info("Carrusel publicado correctamente");
}

main().catch((err) => {
  logger.error("Error fatal en run-now", {}, err);
  process.exit(1);
});