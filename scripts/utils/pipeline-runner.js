const { runStep } = require("./pipeline-utils");
const { logger } = require("./logger");

async function runPipelineSteps({
  label,
  renderStepName,
  renderScript,
  uploadStepName,
  uploadScript,
  publishStepName,
  publishScript,
  noPendingMessage,
  successMessage,
  failedStepPrefix,
  context = {}
}) {
  const pipelineLogger = logger.child({
    pipeline: label,
    ...context
  });

  const startMs = Date.now();

  pipelineLogger.info("Pipeline iniciado");

  const renderResult = runStep(renderStepName, renderScript, {
    pipeline: label,
    ...context
  });

  if (renderResult.noPending) {
    pipelineLogger.info(noPendingMessage, {
      result: "no_pending",
      durationMs: Date.now() - startMs
    });

    pipelineLogger.info("Pipeline terminado", {
      processed: false
    });

    return {
      ok: true,
      processed: false,
      skipped: true,
      noPending: true
    };
  }

  if (!renderResult.ok) {
    pipelineLogger.error("Error en render", {
      status: renderResult.status,
      failedStep: `${failedStepPrefix}-render`,
      durationMs: Date.now() - startMs
    });

    pipelineLogger.info("Pipeline terminado", {
      processed: false
    });

    return {
      ok: false,
      processed: false,
      failedStep: `${failedStepPrefix}-render`
    };
  }

  const uploadResult = runStep(uploadStepName, uploadScript, {
    pipeline: label,
    ...context
  });

  if (!uploadResult.ok) {
    pipelineLogger.error("Error en upload", {
      status: uploadResult.status,
      failedStep: `${failedStepPrefix}-upload`,
      durationMs: Date.now() - startMs
    });

    pipelineLogger.info("Pipeline terminado", {
      processed: false
    });

    return {
      ok: false,
      processed: false,
      failedStep: `${failedStepPrefix}-upload`
    };
  }

  const publishResult = runStep(publishStepName, publishScript, {
    pipeline: label,
    ...context
  });

  if (!publishResult.ok) {
    pipelineLogger.error("Error en publish", {
      status: publishResult.status,
      failedStep: `${failedStepPrefix}-publish`,
      durationMs: Date.now() - startMs
    });

    pipelineLogger.info("Pipeline terminado", {
      processed: false
    });

    return {
      ok: false,
      processed: false,
      failedStep: `${failedStepPrefix}-publish`
    };
  }

  pipelineLogger.info(successMessage, {
    processed: true,
    durationMs: Date.now() - startMs
  });

  pipelineLogger.info("Pipeline terminado", {
    processed: true
  });

  return { ok: true, processed: true };
}

module.exports = {
  runPipelineSteps
};