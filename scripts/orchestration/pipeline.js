require("dotenv").config();

const { spawnSync } = require("child_process");
const path = require("path");

const WAIT_MS = Number(process.env.WAIT_MS || 15 * 60 * 1000);
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const TIMEZONE = process.env.TIMEZONE || "America/Bogota";

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

  return formatter.format(new Date()); // YYYY-MM-DD
}

function getRunWindow() {
  const hour = getLocalHour();

  if (hour === 18) {
    return {
      type: "carousel",
      hour
    };
  }

  if (hour % 2 === 0) {
    return {
      type: "single",
      hour
    };
  }

  return {
    type: null,
    hour
  };
}

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

// Evita ejecutar varias veces dentro de la misma hora
let lastProcessedSlot = "";

async function runMasterPipeline() {
  const windowInfo = getRunWindow();
  const dateKey = getLocalDateKey();
  const slotKey =
    windowInfo.type ? `${dateKey}-${windowInfo.hour}-${windowInfo.type}` : "";

  console.log(`\n[${now()}] 🚀 PIPELINE MAESTRO INICIADO`);
  console.log(
    `[${now()}] 🕒 Hora local (${TIMEZONE}): ${windowInfo.hour}:00`
  );

  if (!windowInfo.type) {
    console.log(
      `[${now()}] ℹ️ Esta hora no está habilitada para publicar.`
    );
    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: true, processed: false, skipped: true };
  }

  if (slotKey === lastProcessedSlot) {
    console.log(
      `[${now()}] ℹ️ Ya se procesó esta ventana horaria (${slotKey}).`
    );
    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: true, processed: false, skipped: true };
  }

  if (windowInfo.type === "carousel") {
    console.log(`[${now()}] 🎯 Ventana activa: solo CARRUSEL`);

    const carouselResult = runCarouselPipeline();

    if (!carouselResult.ok) {
      console.error(
        `[${now()}] ❌ Falló el pipeline de carrusel en: ${carouselResult.failedStep}`
      );
      console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
      return { ok: false, processed: false, failedBranch: "carousel" };
    }

    lastProcessedSlot = slotKey;

    if (!carouselResult.processed) {
      console.log(
        `[${now()}] ℹ️ La ventana era de carrusel, pero no había pendientes.`
      );
    }

    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: true, processed: carouselResult.processed, type: "carousel" };
  }

  if (windowInfo.type === "single") {
    console.log(`[${now()}] 🎯 Ventana activa: solo SINGLE`);

    const singleResult = runSinglePipeline();

    if (!singleResult.ok) {
      console.error(
        `[${now()}] ❌ Falló el pipeline single en: ${singleResult.failedStep}`
      );
      console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
      return { ok: false, processed: false, failedBranch: "single" };
    }

    lastProcessedSlot = slotKey;

    if (!singleResult.processed) {
      console.log(
        `[${now()}] ℹ️ La ventana era single, pero no había pendientes.`
      );
    }

    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return { ok: true, processed: singleResult.processed, type: "single" };
  }

  console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
  return { ok: true, processed: false };
}

async function main() {
  console.log(
    `[${now()}] ⏱️ Pipeline maestro activo. Intervalo configurado: ${WAIT_MS} ms (${Math.round(WAIT_MS / 1000)} s)`
  );
  console.log(`[${now()}] 🌎 Zona horaria activa: ${TIMEZONE}`);

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