const ESTADOS = {
  // Render
  LISTA_PARA_RENDER: "lista_para_render",
  PROCESANDO_RENDER: "procesando_render",
  RENDERIZADO: "renderizado",

  PROCESANDO_RENDER_CAROUSEL: "procesando_render_carousel",
  RENDERIZADO_CAROUSEL: "renderizado_carousel",

  // Upload
  SUBIENDO_SINGLE: "subiendo_single",
  SUBIENDO_CAROUSEL: "subiendo_carousel",

  LISTA_PARA_PUBLICAR: "lista_para_publicar",
  LISTA_PARA_PUBLICAR_CAROUSEL: "lista_para_publicar_carousel",

  // Publish
  PUBLICANDO_SINGLE: "publicando_single",
  PUBLICANDO_CAROUSEL: "publicando_carousel",
  PUBLICANDO_IG_FB: "publicando_instagram_y_facebook",

  PUBLICADO: "publicado",

  // Errores
  ERROR_RENDER: "error_render",
  ERROR_UPLOAD: "error_upload",
  ERROR_PUBLISH: "error_publish"
};

const POST_TIPOS = {
  SINGLE: "single",
  CAROUSEL: "carousel"
};

module.exports = {
  ESTADOS,
  POST_TIPOS
};