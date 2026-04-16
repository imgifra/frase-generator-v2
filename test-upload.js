const { uploadImage } = require("./scripts/upload-lib");

async function main() {
  const result = await uploadImage(
    "./output/hola_desde_automatizacion_normal.png",
    "hola_desde_automatizacion_normal.png"
  );

  console.log(result);
}

main();