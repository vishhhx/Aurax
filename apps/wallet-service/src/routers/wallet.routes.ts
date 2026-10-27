import { Router } from "express";
import { getAssetsAndWalletDetails } from "../controller/wallet.controller";
import { getDeposit, listDeposits, listLedger } from "../controller/history.controller";

export const walletRouter = Router();

walletRouter.get("/assets", getAssetsAndWalletDetails);
walletRouter.get("/deposits", listDeposits);
walletRouter.get("/deposits/:depositId", getDeposit);
walletRouter.get("/ledger", listLedger);
