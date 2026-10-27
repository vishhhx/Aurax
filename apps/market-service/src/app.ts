import express from "express";

import { errorHandler, notFound } from "./middleware/http";
import { marketRouter, opsRouter } from "./routes/market";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(opsRouter);
app.use(marketRouter);
app.use(notFound);
app.use(errorHandler);
