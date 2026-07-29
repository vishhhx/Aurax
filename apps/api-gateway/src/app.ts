import express from "express";
// import { authRouter } from "./router/auth";
import logger from "./config/logger";
import { authenticate } from "./middleware/auth";
import { authProxy, walletProxy } from "./proxy/proxy";
import { errorMiddleware } from "./middleware/error";

const app = express();

app.use("/api/v1/auth/", authProxy);
app.use("/api/v1/wallet/", authenticate, walletProxy);

app.use(errorMiddleware);

export default app;
