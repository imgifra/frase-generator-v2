require("dotenv").config();

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v25.0";

function buildGraphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
}

function buildGraphErrorMessage(res, data, rawText) {
  const error = data?.error;

  if (!error) {
    return `Graph API error ${res.status}${rawText ? `: ${rawText}` : ""}`;
  }

  const parts = [error.message || `Graph API error ${res.status}`];

  if (error.code !== undefined)          parts.push(`code=${error.code}`);
  if (error.error_subcode !== undefined) parts.push(`subcode=${error.error_subcode}`);
  if (error.error_user_title)            parts.push(`title=${error.error_user_title}`);
  if (error.error_user_msg)              parts.push(`user_msg=${error.error_user_msg}`);
  if (error.fbtrace_id)                  parts.push(`fbtrace_id=${error.fbtrace_id}`);

  return parts.join(" | ");
}

async function graphGet(path, query = {}) {
  const url = new URL(buildGraphUrl(path));

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString());
  const rawText = await res.text();

  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = null;
  }

  if (!res.ok || data?.error) {
    const message = buildGraphErrorMessage(res, data, rawText);
    const error = new Error(message);
    error.status = res.status;
    error.responseBody = rawText;
    error.graphError = data?.error || null;
    throw error;
  }

  return data;
}

/**
 * Hace un POST a la Graph API usando form-urlencoded.
 *
 * Soporta valores array: si un valor es un array, cada elemento se agrega
 * como una entrada separada con la misma clave — necesario para campos como
 * attached_media[0], attached_media[1], etc. en carruseles de Facebook.
 */
async function graphPost(path, body) {
  const url = buildGraphUrl(path);

  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      value.forEach((item) => form.append(key, String(item)));
      continue;
    }

    form.append(key, String(value));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  const rawText = await res.text();

  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = null;
  }

  if (!res.ok || data?.error) {
    const message = buildGraphErrorMessage(res, data, rawText);
    const error = new Error(message);
    error.status = res.status;
    error.responseBody = rawText;
    error.graphError = data?.error || null;
    throw error;
  }

  return data;
}

module.exports = { graphGet, graphPost, buildGraphUrl, buildGraphErrorMessage };