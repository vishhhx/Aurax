import { Router } from "express";
import { validateRequest } from "@repo/core/validater";
import { orderSchema } from "../schemas/order.schema";
import { cancelOrder, createOrder, getOrder, listOrders, listTrades } from "../controller/order.controller";

// Mounted behind `authenticate` (app.ts). The API gateway forwards
// /api/v1/order/* here with the mount path stripped.
export const orderRouter = Router();

orderRouter.post("/", validateRequest(orderSchema), createOrder);
orderRouter.get("/", listOrders);
orderRouter.get("/trades", listTrades);
orderRouter.get("/:orderId", getOrder);
orderRouter.delete("/:orderId", cancelOrder);
