import pino from "pino";

const baseLogger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "yyyy-mm-dd HH:MM:ss.l o",
            ignore: "pid,hostname",
          },
        },
});

export const createLogger = (service: string) => {
  return baseLogger.child({
    service,
  });
};
