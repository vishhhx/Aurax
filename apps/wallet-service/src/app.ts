import express from "express";
import { errorMiddleware } from "./middleware/error.middleware";

export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(errorMiddleware);
