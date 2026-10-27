import type { Request } from "express";
import { ApiError } from "@repo/core/rest";

import { marketRegistry } from "../market/registry";

const SYMBOL = /^[A-Z0-9]{2,20}$/;

/**
 * Resolves `:symbol` (case-insensitive) to a served market.
 * 400 for a malformed symbol, 404 for one this service does not serve.
 */
export function requireSymbol(req: Request): string {
  const raw = req.params.symbol;
  const symbol = typeof raw === "string" ? raw.toUpperCase() : "";

  if (!SYMBOL.test(symbol)) {
    throw new ApiError(400, "Invalid market symbol", ["symbol must be 2-20 letters or digits, e.g. BTCUSDC"]);
  }
  if (!marketRegistry.has(symbol)) {
    throw new ApiError(404, `Market not found: ${symbol}`);
  }
  return symbol;
}

function single(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `Invalid ${name}`, [`${name} must be provided once, as a non-empty value`]);
  }
  return value.trim();
}

export function parseLimit(value: unknown, { def, max }: { def: number; max: number }): number {
  const text = single(value, "limit");
  if (text === undefined) return def;
  const limit = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    throw new ApiError(400, "Invalid limit", [`limit must be an integer between 1 and ${max}`]);
  }
  return limit;
}

export function parseTimestamp(value: unknown, name: string): number | undefined {
  const text = single(value, name);
  if (text === undefined) return undefined;
  const ts = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(ts) || ts > 8.64e15) {
    throw new ApiError(400, `Invalid ${name}`, [`${name} must be a Unix timestamp in milliseconds`]);
  }
  return ts;
}

export function parseRange(query: Request["query"]): { startTime?: number; endTime?: number } {
  const startTime = parseTimestamp(query.startTime, "startTime");
  const endTime = parseTimestamp(query.endTime, "endTime");
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new ApiError(400, "Invalid time range", ["startTime must not be after endTime"]);
  }
  return { startTime, endTime };
}

export function optionalString(value: unknown, name: string): string | undefined {
  return single(value, name);
}
