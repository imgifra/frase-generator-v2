require("dotenv").config();

const { now, sleep, validateWaitMs } = require("../utils/pipeline-utils");
const { runCarouselPipeline } = require("./run-carousel");

const WAIT_MS = Number(process.env.WAIT_MS || 2 * 60 * 60 * 1000);

validateWaitMs(WAIT_MS);

async function main() {
  console.log(
    `[${now()}] ⏱️ Pipeline carousel activo. Intervalo configurado: ${WAIT_MS} ms (${Math.round(WAIT_MS / 1000)} s)`
  );

  while (true) {
    try {
      runCarouselPipeline();
    } catch (error) {
      console.error(
        `[${now()}] ❌ Error no controlado en pipeline carousel:`,
        error
      );
    }

    console.log(
      `\n[${now()}] ⏳ Esperando ${Math.round(WAIT_MS / 1000)} segundos...\n`
    );

    await sleep(WAIT_MS);
  }
}

main().catch((error) => {
  console.error(
    `[${now()}] ❌ Error fatal al iniciar pipeline carousel:`,
    error
  );
  process.exit(1);
});