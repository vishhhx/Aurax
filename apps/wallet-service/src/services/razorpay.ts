import Razorpay from "razorpay";
import { ENV } from "../config/env";
import crypto from "crypto";
export class RazorpayService {
  /** Created on first API call: signature checks must not require API keys. */
  private client(): Razorpay {
    if (!ENV.RAZORPAY_CLIENT_ID || !ENV.RAZORPAY_CLIENT_SECRET) {
      throw new Error("Razorpay API keys are not configured");
    }
    return new Razorpay({ key_id: ENV.RAZORPAY_CLIENT_ID, key_secret: ENV.RAZORPAY_CLIENT_SECRET });
  }

  async createOrder(amount: number, currency: string, receipt: string) {
    return this.client().orders.create({
      amount,
      currency,
      receipt,
    });
  }
  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }): boolean {
    const expected = crypto
      .createHmac("sha256", ENV.RAZORPAY_CLIENT_SECRET ?? "")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return safeEqual(expected, signature);
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!ENV.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto.createHmac("sha256", ENV.RAZORPAY_WEBHOOK_SECRET).update(payload).digest("hex");
    return safeEqual(expected, signature);
  }
}

/** Constant-time comparison of hex signatures (no length/timing oracle). */
function safeEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
