import Razorpay from "razorpay";
import { ENV } from "../config/env";
class razorpayService {
  private razorpay;

  constructor() {
    this.razorpay = new Razorpay({
      key_id: ENV.RAZORPAY_CLIENT_ID,
      key_secret: ENV.RAZORPAY_CLIENT_SECRET,
    });
  }

  
}
