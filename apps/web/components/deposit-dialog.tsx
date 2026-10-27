"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowDownToLineIcon,
  ArrowRightIcon,
  BanknoteIcon,
  BuildingIcon,
  CoinsIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  WalletIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type DepositTab = "fiat" | "crypto"
type FiatMethod = "razorpay" | "bank"

const FIAT_METHODS = [
  {
    id: "razorpay",
    name: "UPI, cards & netbanking",
    detail: "Powered by Razorpay · Arrives in seconds",
    icon: SmartphoneIcon,
    badge: "Instant",
    disabled: false,
  },
  {
    id: "bank",
    name: "Bank transfer",
    detail: "IMPS / NEFT to Aurax account",
    icon: BuildingIcon,
    badge: "Soon",
    disabled: true,
  },
] as const

const FIAT_NOTES = [
  { icon: WalletIcon, text: "Credited as USDC to your Spot wallet" },
  { icon: ZapIcon, text: "Minimum ₹100 · Credited once payment is verified" },
  { icon: ShieldCheckIcon, text: "Card & UPI details are handled by Razorpay, never stored by Aurax" },
] as const

const PAYMENT_ROUTE = "/payment/razorpay"

export function DepositDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<DepositTab>("fiat")
  const [method, setMethod] = useState<FiatMethod>("razorpay")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <ArrowDownToLineIcon data-icon="inline-start" />
            Deposit
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Deposit funds</DialogTitle>
          <DialogDescription>
            Add money to your Aurax account to start trading.
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="absolute top-4 right-4"
          >
            <XIcon />
          </Button>
        </DialogClose>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as DepositTab)}
          className="flex flex-col"
        >
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="fiat" className="gap-2">
                <BanknoteIcon aria-hidden="true" className="size-4" />
                Fiat · INR
              </TabsTrigger>
              <TabsTrigger value="crypto" className="gap-2">
                <CoinsIcon aria-hidden="true" className="size-4" />
                Crypto
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="fiat"
            className="flex flex-col gap-5 px-6 pt-5 pb-6 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1 motion-reduce:animate-none"
          >
            <div className="flex flex-col gap-2">
              <p id="deposit-method-label" className="text-sm font-medium">
                Payment method
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                orientation="vertical"
                value={method}
                onValueChange={(v) => v && setMethod(v as FiatMethod)}
                aria-labelledby="deposit-method-label"
                className="w-full"
              >
                {FIAT_METHODS.map((m) => (
                  <ToggleGroupItem
                    key={m.id}
                    value={m.id}
                    disabled={m.disabled}
                    className="h-auto w-full justify-start gap-3 p-3 text-left whitespace-normal data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <m.icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {m.detail}
                      </span>
                    </span>
                    <Badge variant={m.disabled ? "outline" : "secondary"}>
                      {m.badge}
                    </Badge>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <Separator />

            <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              {FIAT_NOTES.map((n) => (
                <li key={n.text} className="flex items-start gap-2.5">
                  <n.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-emphasis" />
                  {n.text}
                </li>
              ))}
            </ul>

            <DialogFooter className="sm:justify-stretch">
              <Button asChild size="lg" className="h-11 w-full">
                <Link href={PAYMENT_ROUTE} onClick={() => setOpen(false)}>
                  Continue to payment
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent
            value="crypto"
            className="px-6 pt-2 pb-6 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1 motion-reduce:animate-none"
          >
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CoinsIcon />
                </EmptyMedia>
                <EmptyTitle>On-chain deposits are coming soon</EmptyTitle>
                <EmptyDescription>
                  Deposits for BTC, ETH, SOL and USDC on their native networks
                  are under development. Meanwhile, buy USDC instantly with INR.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => setTab("fiat")}>
                  <BanknoteIcon data-icon="inline-start" />
                  Deposit INR instead
                </Button>
              </EmptyContent>
            </Empty>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
