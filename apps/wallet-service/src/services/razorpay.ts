import Razorpay from "razorpay";
import { ENV } from "../config/env";

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
}
