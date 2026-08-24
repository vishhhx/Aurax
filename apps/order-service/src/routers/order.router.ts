import { Router } from "express";
import { validateRequest } from "@repo/core/validater";
import { orderSchema } from "../schemas/order.schema";
import { createOrder } from "../controller/order.controller";
export const orderRouter = Router();

orderRouter.post("/", validateRequest(orderSchema),createOrder);
