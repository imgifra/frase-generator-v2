const { spawnSync } = require("child_process");
const path = require("path");

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

function validateWaitMs(waitMs) {
  if (!Number.isFinite(waitMs) || waitMs <= 0) {
    throw new Error("WAIT_MS debe ser un número positivo.");
  }
}

function runStep(stepName, scriptPath) {
  logSection(`INICIANDO: ${stepName}`);

  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    cwd: PROJECT_ROOT,
    env: process.env
  });

  if (result.error) {
    console.error(`[${now()}] Error ejecutando ${stepName}:`, result.error);
    return 1;
  }

  if (result.signal) {
    console.error(`[${now()}] ${stepName} terminó por señal: ${result.signal}`);
    return 1;
  }

  return typeof result.status === "number" ? result.status : 1;
}

module.exports = {
  now,
  sleep,
  logSection,
  validateWaitMs,
  runStep,
  PROJECT_ROOT
};