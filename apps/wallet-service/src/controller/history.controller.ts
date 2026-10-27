import { ApiError, ApiReponse, asyncHandler } from "@repo/core/rest";
import type { Request, Response } from "express";
import { z } from "zod";

import { CursorNotFoundError, HistoryRepository } from "../repositories/history.repository";

const history = new HistoryRepository();

const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().min(1).max(64).optional(),
};
export const listDepositsSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMING", "COMPLETED", "FAILED"]).optional(),
  ...page,
});
export const listLedgerSchema = z.object({
  assetId: z.string().min(1).max(64).optional(),
  referenceType: z.enum(["DEPOSIT", "WITHDRAWAL", "TRADE", "FEE", "ADJUSTMENT"]).optional(),
  ...page,
});

const parseQuery = <T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> => {
  const parsed = schema.safeParse(query);
  if (!parsed.success) throw new ApiError(400, "Invalid query", parsed.error.issues);
  return parsed.data;
};

const userIdOf = (req: Request) => {
  const userId = req.user?.userId;
  if (!userId) throw new ApiError(401, "User not authenticated");
  return userId;
};

const withCursor = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof CursorNotFoundError) throw new ApiError(400, error.message);
    throw error;
  }
};

/** GET /deposits?status&limit&before */
export const listDeposits = asyncHandler(async (req: Request, res: Response) => {
  const userId = userIdOf(req);
  const filter = parseQuery(listDepositsSchema, req.query);
  const deposits = await withCursor(() => history.listDeposits(userId, filter));
  return res.status(200).json(new ApiReponse(true, deposits, "Deposits fetched", 200));
});

/** GET /deposits/:depositId — status polling after checkout */
export const getDeposit = asyncHandler(async (req: Request, res: Response) => {
  const userId = userIdOf(req);
  const deposit = await history.getDeposit(userId, String(req.params.depositId));
  if (!deposit) throw new ApiError(404, "Deposit not found");
  return res.status(200).json(new ApiReponse(true, deposit, "Deposit fetched", 200));
});

/** GET /ledger?assetId&referenceType&limit&before — every balance movement */
export const listLedger = asyncHandler(async (req: Request, res: Response) => {
  const userId = userIdOf(req);
  const filter = parseQuery(listLedgerSchema, req.query);
  const entries = await withCursor(() => history.listLedger(userId, filter));
  return res.status(200).json(new ApiReponse(true, entries, "Ledger fetched", 200));
});
