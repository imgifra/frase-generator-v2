/**
 * telegram-lib.js
 *
 * Envía mensajes al bot de Telegram del pipeline.
 * No tiene dependencias externas — usa fetch nativo de Node 18+.
 *
 * Variables de entorno requeridas:
 *   TELEGRAM_BOT_TOKEN  — token del bot (de @BotFather)
 *   TELEGRAM_CHAT_ID    — chat ID donde llegan las notificaciones
 *
 * Si alguna falta, las funciones logean un warning y retornan sin lanzar error,
 * para no romper el pipeline si Telegram no está configurado.
 */

"use strict";

const TELEGRAM_API = "https://api.telegram.org";

function getConfig() {
  return {
    token:  process.env.TELEGRAM_BOT_TOKEN  || "",
    chatId: process.env.TELEGRAM_CHAT_ID    || ""
  };
}

function isConfigured() {
  const { token, chatId } = getConfig();
  return Boolean(token && chatId);
}

/**
 * Envía un mensaje Markdown al chat configurado.
 * Silencioso si las variables de entorno no están seteadas.
 */
async function sendMessage(text) {
  if (!isConfigured()) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados — notificación omitida.");
    return;
  }

  const { token, chatId } = getConfig();

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:    chatId,
        text,
        parse_mode: "HTML"
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[telegram] Error al enviar mensaje (${res.status}): ${body}`);
    }
  } catch (err) {
    console.warn("[telegram] Error de red al enviar notificación:", err.message);
  }
}

// ─── Builders de mensajes ────────────────────────────────────────────────────

/**
 * Notificación de éxito — post publicado correctamente.
 *
 * @param {object} opts
 * @param {string} opts.tipo       "single" | "carousel"
 * @param {string} opts.cycleId    ID del ciclo
 * @param {string} opts.branch     "form" | "scheduled"
 * @param {boolean} [opts.recovered] true si era un post pendiente que se recuperó
 * @param {number}  opts.durationMs  tiempo total del pipeline
 */
async function notifySuccess({ tipo, cycleId, branch, recovered = false, durationMs }) {
  const emoji   = tipo === "carousel" ? "🎠" : "🖼";
  const origen  = branch === "form" ? "formulario" : "programado";
  const durSeg  = Math.round((durationMs || 0) / 1000);
  const tag     = recovered ? " <i>(pendiente recuperado)</i>" : "";

  await sendMessage(
    `${emoji} <b>Publicado correctamente</b>${tag}\n` +
    `Tipo: ${tipo} · Origen: ${origen}\n` +
    `Ciclo: <code>${cycleId}</code> · ${durSeg}s`
  );
}

/**
 * Notificación de error en un step del pipeline.
 *
 * @param {object} opts
 * @param {string} opts.tipo        "single" | "carousel"
 * @param {string} opts.cycleId
 * @param {string} opts.failedStep  ej. "single-render", "carousel-publish"
 * @param {string} [opts.reason]    mensaje de error adicional si está disponible
 * @param {number}  opts.durationMs
 */
async function notifyError({ tipo, cycleId, failedStep, reason, durationMs }) {
  const durSeg   = Math.round((durationMs || 0) / 1000);
  const stepPart = failedStep ? `\nStep fallido: <code>${failedStep}</code>` : "";
  const reasonPart = reason   ? `\nDetalle: <i>${escapeHtml(reason)}</i>` : "";

  await sendMessage(
    `❌ <b>Error en el pipeline</b>\n` +
    `Tipo: ${tipo} · Ciclo: <code>${cycleId}</code>${stepPart}${reasonPart}\n` +
    `Duración: ${durSeg}s`
  );
}

/**
 * Notificación de ciclo sin pendientes — todo al día.
 *
 * @param {object} opts
 * @param {string} opts.cycleId
 * @param {string} opts.branch
 */
async function notifyNoPending({ cycleId, branch }) {
  const origen = branch === "form" ? "formulario" : "programado";
  await sendMessage(
    `✅ <b>Sin pendientes</b>\n` +
    `No había nada por publicar en este ciclo.\n` +
    `Origen: ${origen} · Ciclo: <code>${cycleId}</code>`
  );
}

/**
 * Notificación de locks stale liberados.
 *
 * @param {object} opts
 * @param {number} opts.filasLiberadas
 * @param {string} opts.cycleId
 */
async function notifyStaleLocks({ filasLiberadas, cycleId }) {
  if (filasLiberadas === 0) return;

  await sendMessage(
    `🔓 <b>Locks liberados</b>\n` +
    `${filasLiberadas} fila${filasLiberadas > 1 ? "s" : ""} bloqueada${filasLiberadas > 1 ? "s" : ""} ` +
    `de ciclos anteriores fueron liberadas.\n` +
    `Ciclo: <code>${cycleId}</code>`
  );
}

/**
 * Notificación de error fatal — el proceso explotó con una excepción no capturada.
 *
 * @param {object} opts
 * @param {string} opts.cycleId
 * @param {string} opts.errorMessage
 */
async function notifyFatal({ cycleId, errorMessage }) {
  await sendMessage(
    `💥 <b>Error fatal en el pipeline</b>\n` +
    `El proceso terminó de forma inesperada.\n` +
    `Ciclo: <code>${cycleId}</code>\n` +
    `Error: <i>${escapeHtml(String(errorMessage).slice(0, 300))}</i>`
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  sendMessage,
  notifySuccess,
  notifyError,
  notifyNoPending,
  notifyStaleLocks,
  notifyFatal
};