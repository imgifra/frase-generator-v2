require("dotenv").config();
const { postTweet } = require("./scripts/libs/x-lib");

async function main() {
  const result = await postTweet("tweet de prueba 🧪");
  console.log("✅ Tweet publicado:", result);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
