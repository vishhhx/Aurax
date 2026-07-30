"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  Banknote,
  Bitcoin,
  ChevronRight,
  CreditCard,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function DepositDialog() {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"cash" | "crypto">("cash")

  const continueToRazorpay = () => {
    setOpen(false)
    router.push("/payment/razorpay")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Deposit
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 text-center">
          <DialogTitle className="text-xl">Deposit</DialogTitle>

          <DialogDescription>Add funds to your Aurax wallet</DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-5">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "cash" | "crypto")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="cash"
                className="gap-2 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-600"
              >
                <Banknote className="h-4 w-4" />
                Cash
              </TabsTrigger>

              <TabsTrigger
                value="crypto"
                className="gap-2 data-[state=active]:bg-red-500/15 data-[state=active]:text-red-500"
              >
                <Bitcoin className="h-4 w-4" />
                Crypto
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative h-[280px] overflow-hidden px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 px-6 py-5"
            >
              {tab === "cash" && (
                <div className="flex h-full flex-col">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-medium">Payment Method</p>

                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border p-4 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                            <CreditCard className="h-5 w-5 text-primary" />
                          </div>

                          <div className="text-left">
                            <p className="font-medium">Razorpay</p>

                            <p className="text-xs text-muted-foreground">
                              UPI • Debit Card • Credit Card • Net Banking
                            </p>
                          </div>
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    className="mt-auto w-full"
                    onClick={continueToRazorpay}
                  >
                    Continue Deposit
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {tab === "crypto" && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                    <Bitcoin className="h-8 w-8 text-red-500" />
                  </div>

                  <h3 className="text-lg font-semibold">Crypto Deposit</h3>

                  <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                    Deposit directly using your preferred blockchain. This
                    feature is currently under development.
                  </p>

                  <Button disabled variant="secondary" className="mt-8 w-full">
                    Coming Soon
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
