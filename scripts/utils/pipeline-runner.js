const { now, runStep } = require("./pipeline-utils");

function runPipelineSteps({
  label,
  renderStepName,
  renderScript,
  uploadStepName,
  uploadScript,
  publishStepName,
  publishScript,
  noPendingMessage,
  successMessage,
  failedStepPrefix
}) {
  console.log(`\n[${now()}] 🚀 PIPELINE ${label} INICIADO\n`);

  const renderStatus = runStep(renderStepName, renderScript);

  if (renderStatus === 10) {
    console.log(`[${now()}] ℹ️ ${noPendingMessage}`);
    console.log(`\n[${now()}] 🏁 PIPELINE ${label} TERMINADO\n`);
    return { ok: true, processed: false, skipped: true };
  }

  if (renderStatus !== 0) {
    console.error(`[${now()}] ❌ Error en render. Código: ${renderStatus}`);
    console.log(`\n[${now()}] 🏁 PIPELINE ${label} TERMINADO\n`);
    return {
      ok: false,
      processed: false,
      failedStep: `${failedStepPrefix}-render`
    };
  }

  const uploadStatus = runStep(uploadStepName, uploadScript);

  if (uploadStatus !== 0) {
    console.error(`[${now()}] ❌ Error en upload. Código: ${uploadStatus}`);
    console.log(`\n[${now()}] 🏁 PIPELINE ${label} TERMINADO\n`);
    return {
      ok: false,
      processed: false,
      failedStep: `${failedStepPrefix}-upload`
    };
  }

  const publishStatus = runStep(publishStepName, publishScript);

  if (publishStatus !== 0) {
    console.error(`[${now()}] ❌ Error en publish. Código: ${publishStatus}`);
    console.log(`\n[${now()}] 🏁 PIPELINE ${label} TERMINADO\n`);
    return {
      ok: false,
      processed: false,
      failedStep: `${failedStepPrefix}-publish`
    };
  }

  console.log(`[${now()}] ✅ ${successMessage}`);
  console.log(`\n[${now()}] 🏁 PIPELINE ${label} TERMINADO\n`);

  return { ok: true, processed: true };
}

module.exports = {
  runPipelineSteps
};