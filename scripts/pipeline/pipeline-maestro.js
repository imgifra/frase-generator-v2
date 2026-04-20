require("dotenv").config();

const { now, sleep, validateWaitMs } = require("../utils/pipeline-utils");
const { runSinglePipeline } = require("./run-single");
const { runCarouselPipeline } = require("./run-carousel");

const WAIT_MS = Number(process.env.WAIT_MS || 15 * 60 * 1000);
const TIMEZONE = process.env.TIMEZONE || "America/Bogota";

validateWaitMs(WAIT_MS);

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

  if (hour === 18) {
    return {
      type: "carousel_preferred",
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

let lastProcessedSlot = "";

async function runMasterPipeline() {
  const windowInfo = getRunWindow();
  const dateKey = getLocalDateKey();
  const slotKey = windowInfo.type
    ? `${dateKey}-${windowInfo.hour}-${windowInfo.type}`
    : "";

  console.log(`\n[${now()}] 🚀 PIPELINE MAESTRO INICIADO`);
  console.log(`[${now()}] 🕒 Hora local (${TIMEZONE}): ${windowInfo.hour}:00`);

  if (!windowInfo.type) {
    console.log(`[${now()}] ℹ️ Esta hora no está habilitada para publicar.`);
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

  if (windowInfo.type === "carousel_preferred") {
    console.log(
      `[${now()}] 🎯 Ventana activa: CARRUSEL preferido, con fallback a SINGLE`
    );

    const carouselResult = runCarouselPipeline();

    if (!carouselResult.ok) {
      console.error(
        `[${now()}] ❌ Falló el pipeline de carrusel en: ${carouselResult.failedStep}`
      );
      console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
      return { ok: false, processed: false, failedBranch: "carousel" };
    }

    if (carouselResult.processed) {
      lastProcessedSlot = slotKey;
      console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
      return { ok: true, processed: true, type: "carousel" };
    }

    console.log(
      `[${now()}] ℹ️ No había carrusel pendiente. Intentando SINGLE como respaldo.`
    );

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
        `[${now()}] ℹ️ Tampoco había singles pendientes para esta ventana.`
      );
    }

    console.log(`\n[${now()}] 🏁 PIPELINE MAESTRO TERMINADO\n`);
    return {
      ok: true,
      processed: singleResult.processed,
      type: "single_fallback"
    };
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