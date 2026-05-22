const STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  ERROR: "error"
};

const GENERAL_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  PUBLISHED: "published",
  ERROR: "error"
};

const POST_TIPOS = {
  SINGLE: "single",
  CAROUSEL: "carousel"
};

const LOCK_STATUS = {
  FREE: "free",
  LOCKED: "locked"
};

const MAX_INTENTOS = 3;

const BG_SEQUENCE = [
  // Ciclo original
  "#f6f1e8", // crema
  "#0d0f14", // negro
  "#f4c400", // amarillo
  "#3d5afe", // azul
  "#e53935", // rojo

  // Ciclo oscuro / melancólico
  "#0d0208", // negro vino
  "#1a0033", // morado noche
  "#0a1628", // azul marino
  "#1c0a00", // café oscuro

  // Ciclo cálido / irónico
  "#ff4d00", // naranja fuego
  "#d4006a", // rosa fuerte
  "#8d6e00", // mostaza
  "#2e7d32"  // verde selva
];

module.exports = {
  STATUS,
  GENERAL_STATUS,
  POST_TIPOS,
  LOCK_STATUS,
  MAX_INTENTOS,
  BG_SEQUENCE
};