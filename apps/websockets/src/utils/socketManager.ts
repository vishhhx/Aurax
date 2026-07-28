import logger from "../config/logger";

let globalIo: any = null;

export const setGlobalIO = (io: any) => {
  globalIo = io;
};

export const getGlobalIO = () => {
  if (!globalIo) {
    logger.warn("Socket.io instance not initialized yet");
  }
  return globalIo;
};
