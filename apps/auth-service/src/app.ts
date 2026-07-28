import express from "express";
import { errorMiddleware } from "./middleware/error.middleware";
// import { router as authRouter } from "./routes/auth.routes";
import { oAuth2Router } from "./routes/oauth.routes";
import { sessionRouter } from "./routes/session.routes";
export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/oauth2", oAuth2Router);
app.use("/sessions", sessionRouter);
// app.use("/auth", authRouter);

app.use(errorMiddleware);
