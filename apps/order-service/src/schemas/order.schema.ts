import { z } from "zod";

export const orderSchema = z
  .object({
    symbol: z.string().min(1),

    side: z.enum(["BUY", "SELL"]),

    orderType: z.enum(["LIMIT", "MARKET"]),

    quantity: z.number().positive(),

    price: z.number().positive(),

    postOnly: z.boolean().default(false),

    timeInForce: z.enum(["GTC", "IOC", "FOK"]).optional(),

    clientOrderId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === "LIMIT" && !data.price) {
      ctx.addIssue({
        code: "custom",
        message: "Price is required for LIMIT orders",
      });
    }

    if (data.orderType === "MARKET" && data.price) {
      ctx.addIssue({
        code: "custom",

        message: "Price is not allowed for MARKET orders",
      });
    }

    if (data.postOnly && data.orderType !== "LIMIT") {
      ctx.addIssue({
        code: "custom",

        message: "Post-only is only supported for LIMIT orders",
      });
    }
  });

export type OrderInput = z.infer<typeof orderSchema>;
