function now() {
  return new Date().toISOString();
}

function formatContext(context = {}) {
  const entries = Object.entries(context).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );

  if (!entries.length) {
    return "";
  }

  const serialized = entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  return ` [${serialized}]`;
}

function write(level, message, context = {}, meta) {
  const contextText = formatContext(context);
  const line = `[${now()}] [${level}]${contextText} ${message}`;

  if (level === "ERROR") {
    console.error(line);

    if (meta) {
      console.error(meta);
    }

    return;
  }

  if (level === "WARN") {
    console.warn(line);

    if (meta) {
      console.warn(meta);
    }

    return;
  }

  console.log(line);

  if (meta) {
    console.log(meta);
  }
}

function createLogger(baseContext = {}) {
  return {
    info(message, context = {}, meta) {
      write("INFO", message, { ...baseContext, ...context }, meta);
    },

    warn(message, context = {}, meta) {
      write("WARN", message, { ...baseContext, ...context }, meta);
    },

    error(message, context = {}, meta) {
      write("ERROR", message, { ...baseContext, ...context }, meta);
    },

    child(extraContext = {}) {
      return createLogger({ ...baseContext, ...extraContext });
    }
  };
}

const logger = createLogger();

module.exports = {
  logger,
  createLogger
};
