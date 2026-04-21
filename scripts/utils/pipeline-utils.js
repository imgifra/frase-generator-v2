const { spawnSync } = require("child_process");
const path = require("path");
const { logger } = require("./logger");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateWaitMs(waitMs) {
  if (!Number.isFinite(waitMs) || waitMs <= 0) {
    throw new Error("WAIT_MS debe ser un número positivo.");
  }
}

function runStep(stepName, scriptPath, context = {}) {
  const stepLogger = logger.child({
    ...context,
    step: stepName
  });

  stepLogger.info("Iniciando paso", {
    script: scriptPath
  });

  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    cwd: PROJECT_ROOT,
    env: process.env
  });

  if (result.error) {
    stepLogger.error("Error ejecutando paso", {}, result.error);
    return 1;
  }

  if (result.signal) {
    stepLogger.error("El paso terminó por señal", {
      signal: result.signal
    });
    return 1;
  }

  const status = typeof result.status === "number" ? result.status : 1;

  if (status === 0) {
    stepLogger.info("Paso completado correctamente", {
      status
    });
  } else {
    stepLogger.warn("Paso terminó con código no exitoso", {
      status
    });
  }

  return status;
}

module.exports = {
  now,
  sleep,
  validateWaitMs,
  runStep,
  PROJECT_ROOT
};