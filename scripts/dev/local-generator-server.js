const http = require("http");
const path = require("path");
const serveStatic = require("serve-static");
const finalhandler = require("finalhandler");

const DEFAULT_PORT = Number(process.env.GENERATOR_PORT || 5173);
const ROOT_DIR = path.join(__dirname, "..", "..");

let serverInstance = null;
let ownedByThisProcess = false;

function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();

    socket
      .once("connect", () => {
        socket.destroy();
        resolve(true);
      })
      .once("error", () => {
        resolve(false);
      })
      .connect(port, host);
  });
}

async function ensureGeneratorServer() {
  const alreadyRunning = await isPortInUse(DEFAULT_PORT);

  if (alreadyRunning) {
    return {
      started: false,
      port: DEFAULT_PORT,
      url: `http://127.0.0.1:${DEFAULT_PORT}`
    };
  }

  const serve = serveStatic(ROOT_DIR, {
    index: ["index.html"]
  });

  serverInstance = http.createServer((req, res) => {
    serve(req, res, finalhandler(req, res));
  });

  await new Promise((resolve, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(DEFAULT_PORT, "127.0.0.1", resolve);
  });

  ownedByThisProcess = true;

  return {
    started: true,
    port: DEFAULT_PORT,
    url: `http://127.0.0.1:${DEFAULT_PORT}`
  };
}

async function stopGeneratorServer() {
  if (!serverInstance || !ownedByThisProcess) {
    return;
  }

  await new Promise((resolve, reject) => {
    serverInstance.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  serverInstance = null;
  ownedByThisProcess = false;
}

module.exports = {
  ensureGeneratorServer,
  stopGeneratorServer
};
