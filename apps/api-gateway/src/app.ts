import express from "express";
import { authRouter } from "./router/auth";

const app = express();

app.use("/api/auth/v1",authRouter)


export default app