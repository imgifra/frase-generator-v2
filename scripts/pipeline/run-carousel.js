const { runPipelineSteps } = require("../utils/pipeline-runner");

function runCarouselPipeline() {
  return runPipelineSteps({
    label: "CAROUSEL",
    renderStepName: "RENDER CAROUSEL",
    renderScript: "scripts/jobs/carousel/render-carousel-from-sheet.js",
    uploadStepName: "UPLOAD CAROUSEL",
    uploadScript: "scripts/jobs/carousel/upload-carousel-from-sheet.js",
    publishStepName: "PUBLISH CAROUSEL",
    publishScript: "scripts/jobs/carousel/publish-carousel-from-sheet.js",
    noPendingMessage: "No quedan carruseles pendientes.",
    successMessage: "Se procesó 1 carrusel completo en este ciclo.",
    failedStepPrefix: "carousel"
  });
}

module.exports = { runCarouselPipeline };