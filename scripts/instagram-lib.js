require("dotenv").config();

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v25.0";
const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

function ensureEnv() {
  if (!IG_USER_ID) {
    throw new Error("Falta IG_USER_ID en .env");
  }

  if (!IG_ACCESS_TOKEN) {
    throw new Error("Falta IG_ACCESS_TOKEN en .env");
  }
}

function buildGraphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphPost(path, body) {
  const url = buildGraphUrl(path);

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const message =
      data?.error?.message ||
      `Graph API error ${res.status}`;

    throw new Error(message);
  }

  return data;
}

async function graphGet(path, query = {}) {
  const url = new URL(buildGraphUrl(path));

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET"
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const message =
      data?.error?.message ||
      `Graph API error ${res.status}`;

    throw new Error(message);
  }

  return data;
}

async function createImageContainer({ imageUrl, caption }) {
  ensureEnv();

  return graphPost(`${IG_USER_ID}/media`, {
    image_url: imageUrl,
    caption: caption || "",
    access_token: IG_ACCESS_TOKEN
  });
}

async function getContainerStatus(creationId) {
  ensureEnv();

  return graphGet(`${creationId}`, {
    fields: "id,status_code,status",
    access_token: IG_ACCESS_TOKEN
  });
}

async function waitUntilContainerReady(creationId) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const statusData = await getContainerStatus(creationId);
    const statusCode = statusData.status_code || statusData.status || "";

    console.log(
      `Container ${creationId} estado intento ${attempt}/${MAX_POLL_ATTEMPTS}: ${statusCode}`
    );

    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return statusData;
    }

    if (statusCode === "ERROR") {
      throw new Error(`El contenedor ${creationId} falló con status_code=ERROR`);
    }

    if (statusCode === "EXPIRED") {
      throw new Error(`El contenedor ${creationId} expiró antes de publicarse`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `El contenedor ${creationId} no estuvo listo a tiempo para publicar`
  );
}

async function publishContainer({ creationId }) {
  ensureEnv();

  return graphPost(`${IG_USER_ID}/media_publish`, {
    creation_id: creationId,
    access_token: IG_ACCESS_TOKEN
  });
}

async function publishImagePost({ imageUrl, caption }) {
  const container = await createImageContainer({
    imageUrl,
    caption
  });

  if (!container.id) {
    throw new Error("No se recibió id de contenedor al crear media.");
  }

  await waitUntilContainerReady(container.id);

  const published = await publishContainer({
    creationId: container.id
  });

  if (!published.id) {
    throw new Error("No se recibió id del post publicado.");
  }

  return {
    creationId: container.id,
    mediaId: published.id
  };
}

module.exports = {
  publishImagePost
};
