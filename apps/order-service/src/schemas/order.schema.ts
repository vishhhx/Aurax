import { z } from "zod";

// Accept JSON numbers or decimal strings; always handled as exact decimals.
const decimal = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v.toString() : v.trim()))
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, "must be a positive decimal");

export const orderSchema = z
  .object({
    symbol: z
      .string()
      .min(1)
      .transform((s) => s.replace(/[-_/]/g, "").toUpperCase()),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.enum(["LIMIT", "MARKET"]),
    quantity: decimal,
    price: decimal.optional(),
    postOnly: z.boolean().default(false),
    timeInForce: z.enum(["GTC", "IOC", "FOK"]).default("GTC"),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === "LIMIT" && data.price === undefined) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Price is required for LIMIT orders" });
    }
    if (data.orderType === "MARKET" && data.price !== undefined) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Price is not allowed for MARKET orders" });
    }
    if (data.postOnly && data.orderType !== "LIMIT") {
      ctx.addIssue({ code: "custom", path: ["postOnly"], message: "Post-only is only supported for LIMIT orders" });
    }
    if (data.postOnly && data.timeInForce !== "GTC") {
      ctx.addIssue({ code: "custom", path: ["timeInForce"], message: "Post-only orders must be GTC" });
    }
    if (data.orderType === "MARKET" && data.timeInForce === "GTC") {
      // A market order never rests; treat it as immediate-or-cancel.
      data.timeInForce = "IOC";
    }
  });

export type OrderInput = z.infer<typeof orderSchema>;

export const listOrdersSchema = z.object({
  status: z.enum(["open", "closed", "all"]).default("all"),
  symbol: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** id of the last row of the previous page */
  before: z.string().min(1).max(128).optional(),
});

export const listTradesSchema = z.object({
  symbol: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().min(1).max(128).optional(),
});
