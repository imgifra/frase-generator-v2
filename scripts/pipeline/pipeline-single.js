require("dotenv").config();

const { logger } = require("../utils/logger");
const { runSinglePipeline } = require("./run-single");

async function main() {
  const cycleId = `${Date.now()}`;
  const log = logger.child({
    pipeline: "SINGLE_MANUAL_RUN",
    cycleId
  });

  log.info("Iniciando corrida manual de single");

  const result = await runSinglePipeline({
    cycleId,
    branch: "single_manual"
  });

  log.info("Corrida manual finalizada", {
    ok: result.ok,
    processed: result.processed,
    failedStep: result.failedStep || "",
    skipped: result.skipped || false
  });

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Error fatal en corrida manual single", {}, error);
  process.exit(1);
});