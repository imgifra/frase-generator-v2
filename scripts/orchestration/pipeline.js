require("dotenv").config();

const { spawnSync } = require("child_process");
const path = require("path");

const WAIT_MS = Number(process.env.WAIT_MS || 2 * 60 * 60 * 1000);
const PROJECT_ROOT = path.join(__dirname, "..");

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logSection(title) {
  console.log("\n=================================");
  console.log(`[${now()}] ${title}`);
  console.log("=================================\n");
}

function runStep(stepName, scriptPath) {
  logSection(`INICIANDO: ${stepName}`);

  const result = spawnSync("node", [scriptPath], {
    stdio: "inherit",
    cwd: PROJECT_ROOT,
    env: process.env
  });

  if (result.error) {
    console.error(`[${now()}] Error ejecutando ${stepName}:`, result.error);
    return 1;
  }

  if (result.signal) {
    console.error(
      `[${now()}] ${stepName} terminó por señal: ${result.signal}`
    );
    return 1;
  }

  return typeof result.status === "number" ? result.status : 1;
}

async function runPipeline() {
  console.log(`\n[${now()}] 🚀 PIPELINE AUTOMÁTICO INICIADO\n`);

  const renderStatus = runStep("RENDER", "scripts/render-single-from-sheet.js.js");

  if (renderStatus === 10) {
    console.log(`[${now()}] ✅ No quedan más filas pendientes.`);
    console.log(`\n[${now()}] 🏁 PIPELINE TERMINADO\n`);
    return { ok: true, processed: false };
  }

  if (renderStatus !== 0) {
    console.error(`[${now()}] ❌ Error en render. Código: ${renderStatus}`);
    console.log(`\n[${now()}] 🏁 PIPELINE TERMINADO\n`);
    return { ok: false, processed: false, failedStep: "render" };
  }

  const uploadStatus = runStep("UPLOAD", "scripts/upload-single-from-sheet.js");

  if (uploadStatus !== 0) {
    console.error(`[${now()}] ❌ Error en upload. Código: ${uploadStatus}`);
    console.log(`\n[${now()}] 🏁 PIPELINE TERMINADO\n`);
    return { ok: false, processed: false, failedStep: "upload" };
  }

  const publishStatus = runStep("PUBLISH", "scripts/publish-single-from-sheet.js");

  if (publishStatus !== 0) {
    console.error(`[${now()}] ❌ Error en publish. Código: ${publishStatus}`);
    console.log(`\n[${now()}] 🏁 PIPELINE TERMINADO\n`);
    return { ok: false, processed: false, failedStep: "publish" };
  }

  console.log(`[${now()}] ✅ Se procesó 1 sola fila en este ciclo.`);
  console.log(`\n[${now()}] 🏁 PIPELINE TERMINADO\n`);

  return { ok: true, processed: true };
}

async function main() {
  console.log(
    `[${now()}] ⏱️ Pipeline activo. Intervalo configurado: ${WAIT_MS} ms (${Math.round(WAIT_MS / 1000)} s)`
  );

  while (true) {
    try {
      await runPipeline();
    } catch (error) {
      console.error(`[${now()}] ❌ Error no controlado en el pipeline:`, error);
    }

    console.log(
      `\n[${now()}] ⏳ Esperando ${Math.round(WAIT_MS / 1000)} segundos (~${(
        WAIT_MS /
        1000 /
        60
      ).toFixed(2)} min) para el próximo ciclo...\n`
    );

    await sleep(WAIT_MS);
  }
}

main().catch((error) => {
  console.error(`[${now()}] ❌ Error fatal al iniciar pipeline:`, error);
  process.exit(1);
});