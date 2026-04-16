require("dotenv").config();

const { spawnSync } = require("child_process");
const path = require("path");

const WAIT_MS = Number(process.env.WAIT_MS || 2 * 60 * 60 * 1000);

function runStep(stepName, scriptPath) {
  console.log("\n=================================");
  console.log(`INICIANDO: ${stepName}`);
  console.log("=================================\n");

  const result = spawnSync("node", [scriptPath], {
    stdio: "inherit",
    cwd: path.join(__dirname, "..")
  });

  return result.status;
}

async function runPipeline() {
  console.log("\n🚀 PIPELINE AUTOMÁTICO INICIADO\n");

  const renderStatus = runStep("RENDER", "scripts/render-from-sheet.js");

  if (renderStatus === 10) {
    console.log("\n✅ No quedan más filas pendientes.");
    console.log("\n🏁 PIPELINE TERMINADO.\n");
    return;
  }

  if (renderStatus !== 0) {
    console.log("\n❌ Error en render.");
    console.log("\n🏁 PIPELINE TERMINADO.\n");
    return;
  }

  const uploadStatus = runStep("UPLOAD", "scripts/upload-from-sheet.js");
  if (uploadStatus !== 0) {
    console.log("\n❌ Error en upload.");
    console.log("\n🏁 PIPELINE TERMINADO.\n");
    return;
  }

  const publishStatus = runStep("PUBLISH", "scripts/publish-from-sheet.js");
  if (publishStatus !== 0) {
    console.log("\n❌ Error en publish.");
    console.log("\n🏁 PIPELINE TERMINADO.\n");
    return;
  }

  console.log("\n✅ Se procesó 1 sola fila en este ciclo.");
  console.log("\n🏁 PIPELINE TERMINADO.\n");
}

async function main() {
  while (true) {
    await runPipeline();
    console.log(`\n⏳ Esperando ${WAIT_MS / 1000} segundos para el próximo ciclo...\n`);
    await new Promise(resolve => setTimeout(resolve, WAIT_MS));
  }
}

main();