require("dotenv").config();

const { spawnSync } = require("child_process");
const path = require("path");

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

  while (true) {
    const renderStatus = runStep("RENDER", "scripts/render-from-sheet.js");
    if (renderStatus === 10) { console.log("\n✅ No quedan más filas pendientes."); break; }
    if (renderStatus !== 0) { console.log("\n❌ Error en render."); break; }

    const uploadStatus = runStep("UPLOAD", "scripts/upload-from-sheet.js");
    if (uploadStatus !== 0) { console.log("\n❌ Error en upload."); break; }

    const publishStatus = runStep("PUBLISH", "scripts/publish-from-sheet.js");
    if (publishStatus !== 0) { console.log("\n❌ Error en publish."); break; }
  }

  console.log("\n🏁 PIPELINE TERMINADO.\n");
}

async function main() {
  while (true) {
    await runPipeline();
    console.log("\n⏳ Esperando 2 horas para el próximo ciclo...\n");
    await new Promise(resolve => setTimeout(resolve, 2 * 60 * 60 * 1000));
  }
}

main();