import { Router } from "express";
import { getAssetsAndWalletDetails } from "../controller/wallet.controller";

export const walletRouter = Router();

walletRouter.get("/assets", getAssetsAndWalletDetails);
