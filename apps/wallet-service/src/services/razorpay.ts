import Razorpay from "razorpay";
import { ENV } from "../config/env";
import crypto from "crypto";
export class RazorpayService {
  private readonly razorpay: Razorpay;

  constructor() {
    this.razorpay = new Razorpay({
      key_id: ENV.RAZORPAY_CLIENT_ID,
      key_secret: ENV.RAZORPAY_CLIENT_SECRET,
    });
  }

  async createOrder(amount: number, currency: string, receipt: string) {
    return this.razorpay.orders.create({
      amount,
      currency,
      receipt,
    });
  }
  verifyPaymentSignature({
    orderId,
    paymentId,
    signature,
  }: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const generatedSignature = crypto
      .createHmac("sha256", ENV.RAZORPAY_CLIENT_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return generatedSignature === signature;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac("sha256", ENV.RAZORPAY_WEBHOOK_SECRET!)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );
  }
}
