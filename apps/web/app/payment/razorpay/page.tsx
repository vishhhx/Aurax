import type { Metadata } from "next"
import { RazorpayCheckout } from "@/components/payment/razorpay-checkout"

export const metadata: Metadata = {
  title: "Buy USDC with INR",
}

export default function RazorpayPaymentPage() {
  return <RazorpayCheckout />
}
