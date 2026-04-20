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

  const params = new URLSearchParams({
    url: imageUrl,
    caption: caption || "",
    access_token: FB_PAGE_ACCESS_TOKEN
  });

  const response = await fetch(
    `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/photos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message || JSON.stringify(data) || "Error desconocido";
    throw new Error(`Error publicando en Facebook: ${message}`);
  }

  return {
    postId: data.post_id || "",
    photoId: data.id || ""
  };
}

module.exports = {
  publishFacebookPhoto
};