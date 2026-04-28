require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  ensureGeneratorServer,
  stopGeneratorServer
} = require("../dev/local-generator-server");

const GENERATOR_URL = (
  process.env.GENERATOR_URL || "http://127.0.0.1:5173"
).replace(/\/+$/, "");

function stripAccents(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildSafeName(text) {
  const normalized = stripAccents(text);

  return (
    normalized
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 60) || "frase"
  );
}

function buildRenderUrl({ text, mode, bg, baseUrl }) {
  const params = new URLSearchParams({
    text,
    mode,
    bg
  });

  return `${baseUrl}/?${params.toString()}`;
}

function isConnectionRefused(error) {
  const msg = error?.message || "";
  return msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("ECONNREFUSED");
}

async function renderPhrase({ text, mode = "normal", bg = "#ffffff" }) {
  if (!text || !String(text).trim()) {
    throw new Error("No se recibió texto para renderizar.");
  }

  const outputDir = path.join(__dirname, "..", "..", "output");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeName = buildSafeName(String(text));
  const fileName = `${safeName}_${mode}_${Date.now()}.png`;
  const outputPath = path.join(outputDir, fileName);

  const serverInfo = await ensureGeneratorServer();
  const baseUrl = serverInfo?.url || GENERATOR_URL;

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1400 }
    });

    const url = buildRenderUrl({ text, mode, bg, baseUrl });
    console.log("Abriendo:", url);

    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000
      });
    } catch (error) {
      if (isConnectionRefused(error)) {
        throw new Error(`No se pudo conectar al generador en ${baseUrl}.`);
      }
      throw error;
    }

    await page.waitForFunction(
      () => {
        return (
          window.assetsReady?.watermark &&
          window.assetsReady?.retroLogo &&
          typeof window.getCanvasBase64 === "function"
        );
      },
      { timeout: 15000 }
    );

    await page.waitForTimeout(1200);

    const dataUrl = await page.evaluate(() => {
      return window.getCanvasBase64();
    });

    if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("El generador no devolvió un PNG válido desde el canvas.");
    }

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(outputPath, base64Data, "base64");

    return {
      fileName,
      outputPath
    };
  } finally {
    await browser.close();
    await stopGeneratorServer();
  }
}

module.exports = {
  renderPhrase
};