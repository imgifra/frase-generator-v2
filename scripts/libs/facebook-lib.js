const axios = require("axios");

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

if (!FB_PAGE_ID) {
  throw new Error("Falta FB_PAGE_ID en el .env");
}

if (!FB_PAGE_ACCESS_TOKEN) {
  throw new Error("Falta FB_PAGE_ACCESS_TOKEN en el .env");
}

async function publishFacebookPhoto({ imageUrl, caption }) {
  if (!imageUrl) {
    throw new Error("imageUrl es requerido para publicar en Facebook.");
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/photos`,
      null,
      {
        params: {
          url: imageUrl,
          caption: caption || "",
          access_token: FB_PAGE_ACCESS_TOKEN
        },
        timeout: 30000
      }
    );

    return {
      postId: response.data.post_id || "",
      photoId: response.data.id || ""
    };
  } catch (error) {
    const apiError =
      error.response?.data?.error?.message ||
      error.response?.data ||
      error.message;

    throw new Error(
      `Error publicando en Facebook: ${
        typeof apiError === "string" ? apiError : JSON.stringify(apiError)
      }`
    );
  }
}

module.exports = {
  publishFacebookPhoto
};
