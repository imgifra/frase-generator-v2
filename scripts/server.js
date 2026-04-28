require("dotenv").config();

const express = require("express");
const { spawnSync } = require("child_process");
const path = require("path");
const { logger } = require("./utils/logger");

const app = express();
app.use(express.json());

const API_TOKEN = process.env.API_TOKEN;
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, "..");

const renderApp = express();

renderApp.use(express.static(PROJECT_ROOT));

renderApp.listen(5173, "127.0.0.1", () => {
  logger.info("Servidor render local activo", { port: 5173 });
});

function authMiddleware(req, res, next) {
  const token = req.headers["x-token"];
  if (!API_TOKEN || token !== API_TOKEN) {
    return res.status(401).json({ error: "Token inválido" });
  }
  next();
}

app.post("/run-now", authMiddleware, (req, res) => {
  const { carousel_id } = req.body;

  if (!carousel_id) {
    return res.status(400).json({ error: "Falta carousel_id" });
  }

  logger.info("run-now recibido", { carousel_id });

  res.json({ ok: true, carousel_id });

  const env = {
    ...process.env,
    TARGET_CAROUSEL_ID: carousel_id,
    PIPELINE_CYCLE_ID: `manual_${Date.now()}`
  };

  const result = spawnSync(
    process.execPath,
    ["scripts/pipeline/run-now.js"],
    {
      stdio: "inherit",
      cwd: PROJECT_ROOT,
      env
    }
  );

  if (result.error || result.status !== 0) {
    logger.error("run-now falló", { carousel_id, status: result.status });
    return;
  }

  logger.info("run-now completado", { carousel_id });
});

app.get("/publicar", (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, "publicar.html"));
});
app.get("/health", (req, res) => {
  res.json({ ok: true });
});
app.listen(PORT, () => {
  logger.info(`Servidor HTTP activo`, { port: PORT });
});

// Arranca pipeline maestro en paralelo
require("./pipeline/pipeline-maestro");