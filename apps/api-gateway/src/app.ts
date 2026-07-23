import express from "express";
// import { authRouter } from "./router/auth";
import logger from "./config/logger";
import { authProxy, walletProxy } from "./proxy/proxy";

const app = express();

app.use("/api/v1/auth/", authProxy);
app.use("/api/v1/wallet/", walletProxy);

export default app;
