const { runStep } = require("./pipeline-utils");
const { logger } = require("./logger");

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
  failedStepPrefix,
  context = {}
}) {
  const pipelineLogger = logger.child({
    pipeline: label,
    ...context
  });

  const startMs = Date.now();

  pipelineLogger.info("Pipeline iniciado");

  const renderStatus = runStep(renderStepName, renderScript, {
    pipeline: label,
    ...context
  });

  if (renderStatus === 10) {
    pipelineLogger.info(noPendingMessage, {
      result: "no_pending",
      durationMs: Date.now() - startMs
    });

    pipelineLogger.info("Pipeline terminado", {
      processed: false
    });

    return { ok: true, processed: false, skipped: true };
  }

  if (renderStatus !== 0) {
    pipelineLogger.error("Error en render", {
      status: renderStatus,
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

  const uploadStatus = runStep(uploadStepName, uploadScript, {
    pipeline: label,
    ...context
  });

  if (uploadStatus !== 0) {
    pipelineLogger.error("Error en upload", {
      status: uploadStatus,
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

  const publishStatus = runStep(publishStepName, publishScript, {
    pipeline: label,
    ...context
  });

  if (publishStatus !== 0) {
    pipelineLogger.error("Error en publish", {
      status: publishStatus,
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