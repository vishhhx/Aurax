import { Router } from "express";

import {
  GetAggregateTrades,
  GetHistoricalTrades,
  GetRecentTrades,
  GetTradeById,
  GetTradeCount,
} from "../controllers/trade.controller";

const router = Router();

router.get("/:symbol/trades/count", GetTradeCount);
router.get("/:symbol/aggregate-trades", GetAggregateTrades);
router.get("/:symbol/historical-trades", GetHistoricalTrades);
router.get("/:symbol/trades/:tradeId", GetTradeById);
router.get("/:symbol/trades", GetRecentTrades);

export default router;
