require("dotenv").config();

const crypto = require("crypto");

const X_API_KEY             = process.env.X_API_KEY;
const X_API_SECRET          = process.env.X_API_SECRET;
const X_ACCESS_TOKEN        = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

function ensureEnv() {
  if (!X_API_KEY)             throw new Error("Falta X_API_KEY en .env");
  if (!X_API_SECRET)          throw new Error("Falta X_API_SECRET en .env");
  if (!X_ACCESS_TOKEN)        throw new Error("Falta X_ACCESS_TOKEN en .env");
  if (!X_ACCESS_TOKEN_SECRET) throw new Error("Falta X_ACCESS_TOKEN_SECRET en .env");
}

function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function buildOAuthHeader(method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key:     X_API_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
    oauth_token:            X_ACCESS_TOKEN,
    oauth_version:          "1.0"
  };

  const allParams = { ...extraParams, ...oauthParams };
  const sortedParams = Object.keys(allParams).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const signingKey = `${percentEncode(X_API_SECRET)}&${percentEncode(X_ACCESS_TOKEN_SECRET)}`;
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signature = crypto.createHmac("sha1", signingKey)
    .update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  const headerValue = "OAuth " + Object.keys(oauthParams).sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return headerValue;
}

async function postTweet(text) {
  ensureEnv();

  const url = "https://api.twitter.com/2/tweets";
  const body = JSON.stringify({ text });
  const auth = buildOAuthHeader("POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json"
    },
    body
  });

  const data = await res.json();

  if (!res.ok || data.errors) {
    throw new Error(`X API error: ${JSON.stringify(data.errors || data)}`);
  }

  return data.data;
}

module.exports = { postTweet };