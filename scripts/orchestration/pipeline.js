require("dotenv").config();

const { spawnSync } = require("child_process");
const path = require("path");

const WAIT_MS = Number(process.env.WAIT_MS || 2 * 60 * 60 * 1000);
const PROJECT_ROOT = path.join(__dirname, "..", "..");

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

/**
 * Convención usada:
 * - 0  => éxito
 * - 10 => no hay pendientes
 * - otro => error
 */

function runCarouselPipeline() {
  console.log(`\n[${now()}] 🎠 Intentando pipeline de carrusel...\n`);

  const renderStatus = runStep(
    "RENDER CAROUSEL",
    "scripts/jobs/render-carousel-from-sheet.js"
  );

  if (renderStatus === 10) {
    console.log(`[${now()}] ℹ️ No hay carruseles pendientes.`);
    return { ok: true, processed: false, skipped: true };
  }

  if (renderStatus !== 0) {
    console.error(
      `[${now()}] ❌ Error en render carousel. Código: ${renderStatus}`
    );
    return {
      ok: false,
      processed: false,
      failedStep: "render-carousel"
    };
  }

  const uploadStatus = runStep(
    "UPLOAD CAROUSEL",
    "scripts/jobs/upload-carousel-from-sheet.js"
  );

  if (uploadStatus !== 0) {
    console.error(
      `[${now()}] ❌ Error en upload carousel. Código: ${uploadStatus}`
    );
    return {
      ok: false,
      processed: false,
      failedStep: "upload-carousel"
    };
  }

  const publishStatus = runStep(
    "PUBLISH CAROUSEL",
    "scripts/jobs/publish-carousel-from-sheet.js"
  );

  if (publishStatus !== 0) {
    console.error(
      `[${now()}] ❌ Error en publish carousel. Código: ${publishStatus}`
    );
    return {
      ok: false,
      processed: false,
      failedStep: "publish-carousel"
    };
  }

  console.log(`[${now()}] ✅ Se procesó 1 carrusel completo en este ciclo.`);
  return { ok: true, processed: true, type: "carousel" };
}

function runSinglePipeline() {
  console.log(`\n[${now()}] 🖼️ Intentando pipeline single...\n`);

  const renderStatus = runStep(
    "RENDER SINGLE",
    "scripts/jobs/render-single-from-sheet.js"
  );

  if (renderStatus === 10) {
    console.log(`[${now()}] ℹ️ No hay posts single pendientes.`);
    return { ok: true, processed: false, skipped: true };
  }

  if (renderStatus !== 0) {
    console.error(
      `[${now()}] ❌ Error en render single. Código: ${renderStatus}`
    );
    return {
      ok: false,
      processed: false,
      failedStep: "render-single"
    };
  }

  const uploadStatus = runStep(
    "UPLOAD SINGLE",
    "scripts/jobs/upload-single-from-sheet.js"
  );

  if (uploadStatus !== 0) {
    console.error(
      `[${now()}] ❌ Error en upload single. Código: ${uploadStatus}`
    );
    return {
      ok: false,
      processed: false,
      failedStep: "upload-single"
    };
  }

  const publishStatus = runStep(
    "PUBLISH SINGLE",
    "scripts/jobs/publish-single-from-sheet.js"
  );

  if (publishStatus !== 0) {
    console.error(
      `[${now()}] ❌ Error en publish single. Código: ${publishStatus}`
    );
    return {
      ok: false,
      processed: false,
      failedStep: "publish-single"
    };
  }

  console.log(`[${now()}] ✅ Se procesó 1 post single en este ciclo.`);
  return { ok: true, processed: true, type: "single" };
}

async function runMasterPipeline() {
  console.log(`\n[${now()}] 🚀 PIPELINE MAESTRO INICIADO\n`);

  const carouselResult = runCarouselPipeline();

  if (!carouselResult.ok) {
    console.error(
      `[${now()}] ❌ Falló el pipeline de carrusel en: ${carouselResult.failedStep}`
    );
    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: false, processed: false, failedBranch: "carousel" };
  }

  if (carouselResult.processed) {
    console.log(
      `[${now()}] ✅ El pipeline maestro completó un carrusel. No se intentará single en este ciclo.`
    );
    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: true, processed: true, type: "carousel" };
  }

  const singleResult = runSinglePipeline();

  if (!singleResult.ok) {
    console.error(
      `[${now()}] ❌ Falló el pipeline single en: ${singleResult.failedStep}`
    );
    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: false, processed: false, failedBranch: "single" };
  }

  if (singleResult.processed) {
    console.log(
      `[${now()}] ✅ El pipeline maestro completó un post single.`
    );
    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: true, processed: true, type: "single" };
  }

  console.log(
    `[${now()}] ✅ No había carruseles ni singles pendientes en este ciclo.`
  );
  console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
  return { ok: true, processed: false, type: null };
}

async function main() {
  console.log(
    `[${now()}] ⏱️ Pipeline maestro activo. Intervalo configurado: ${WAIT_MS} ms (${Math.round(WAIT_MS / 1000)} s)`
  );

  while (true) {
    try {
      await runMasterPipeline();
    } catch (error) {
      console.error(
        `[${now()}] ❌ Error no controlado en el pipeline maestro:`,
        error
      );
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
  console.error(
    `[${now()}] ❌ Error fatal al iniciar pipeline maestro:`,
    error
  );
  process.exit(1);
});