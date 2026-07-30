"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowDown,
  BadgeIndianRupee,
  CircleDollarSign,
  WalletCards,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

const usdcPrice = 95.72

function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value)
}

export default function RazorpayPaymentPage() {
  const [amount, setAmount] = useState("1000")

  const spend = Math.max(Number(amount) || 0, 0)

  const receive = useMemo(() => spend / usdcPrice, [spend])

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col px-5 py-6">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex w-fit items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        {/* Header */}
        <div className="pb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <WalletCards className="h-6 w-6" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Buy USDC</h1>

          <p className="mt-1 text-xs text-muted-foreground">
            Instant purchase using Razorpay
          </p>

          <div className="mt-4 inline-flex rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            1 USDC = {formatInr(usdcPrice)}
          </div>
        </div>

        <div className="space-y-5">
          {/* Pay */}
          <Field>
            <FieldLabel className="mb-1 text-sm">You Pay</FieldLabel>

            <InputGroup className="rounded-2xl bg-muted/40">
              <InputGroupInput
                value={amount}
                type="number"
                inputMode="decimal"
                placeholder="0"
                className="h-14 border-0 bg-transparent text-xl font-semibold shadow-none focus-visible:ring-0"
                onChange={(e) => setAmount(e.target.value)}
              />

              <InputGroupAddon className="border-0 bg-transparent text-sm font-medium">
                <BadgeIndianRupee className="mr-1 h-4 w-4" />
                INR
              </InputGroupAddon>
            </InputGroup>

            <FieldDescription className="mt-1 text-xs">
              Minimum deposit ₹100
            </FieldDescription>
          </Field>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40">
              <ArrowDown className="h-4 w-4 text-primary" />
            </div>
          </div>

          {/* Receive */}
          <Field>
            <FieldLabel className="mb-1 text-sm">You Receive</FieldLabel>

            <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {receive.toLocaleString("en-IN", {
                    maximumFractionDigits: 6,
                  })}
                </p>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Estimated USDC
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <CircleDollarSign className="h-5 w-5" />
              </div>
            </div>
          </Field>

          {/* Summary */}
          <div className="rounded-2xl bg-muted/40 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Exchange Rate</span>

              <span className="font-medium">
                1 USDC = {formatInr(usdcPrice)}
              </span>
            </div>

            <div className="my-3 h-px bg-border" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Payable</span>

              <span className="text-lg font-semibold">{formatInr(spend)}</span>
            </div>
          </div>

          {/* Button */}
          <Button
            className="h-11 w-full rounded-xl text-sm font-medium"
            disabled={spend < 100}
          >
            Continue to Razorpay
          </Button>
        </div>
      </div>
    </main>
  )
}
