const { renderPhrase } = require("../libs/render-lib");

async function main() {
  const text = process.argv[2] || "Te respondo como me tratas, para que entiendas sin explicarte";
  const mode = process.argv[3] || "retro3d";
  const bg = process.argv[4] || "#ffffff";

  const result = await renderPhrase({ text, mode, bg });
  console.log("Imagen guardada en:", result.outputPath);
}

main().catch((err) => {
  console.error("Error renderizando:", err);
  process.exit(1);
});