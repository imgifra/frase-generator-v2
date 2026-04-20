require("dotenv").config();

const { now, sleep, validateWaitMs } = require("../utils/pipeline-utils");
const { runSinglePipeline } = require("./run-single");

const WAIT_MS = Number(process.env.WAIT_MS || 2 * 60 * 60 * 1000);

validateWaitMs(WAIT_MS);

async function main() {
  console.log(
    `[${now()}] ⏱️ Pipeline single activo. Intervalo configurado: ${WAIT_MS} ms (${Math.round(WAIT_MS / 1000)} s)`
  );

  while (true) {
    try {
      runSinglePipeline();
    } catch (error) {
      console.error(
        `[${now()}] ❌ Error no controlado en pipeline single:`,
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
    `[${now()}] ❌ Error fatal al iniciar pipeline single:`,
    error
  );
  process.exit(1);
});