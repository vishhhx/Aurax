import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"

// next/navigation is provided by the Next runtime; stand it in for component tests.
const replace = mock((path: string) => void path)
const push = mock((path: string) => void path)
let pathname = "/wallet"
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace, push, back() {}, forward() {}, refresh() {}, prefetch() {} }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}))

const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react")
const { Provider } = await import("react-redux")
const { ThemeProvider } = await import("@/components/theme-provider")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { RequireAuth } = await import("@/components/app/require-auth")
const { ThemeToggle } = await import("@/components/app/site-header")
const { OrderForm } = await import("@/components/trade/order-form")
const { TerminalProvider } = await import("@/components/trade/terminal-context")
const { makeStore } = await import("@/store")
const { http } = await import("@/lib/api/client")
const { BTCUSDC, asset } = await import("./fixtures")

type Store = ReturnType<typeof makeStore>

const user = { userId: "u1", email: "ada@example.com", name: "Ada Lovelace", provider: "google" as const, isEmailVerified: true }

function storeWith(status: "unknown" | "authenticated" | "unauthenticated", balances = { USDC: "1000", BTC: "0" }): Store {
  const base = makeStore()
  const s = base.getState()
  return makeStore({
    ...s,
    auth: { user: status === "authenticated" ? user : null, status, error: null },
    wallet: {
      ...s.wallet,
      status: "ready",
      assets: [asset({ availableBalance: balances.USDC }), asset({ assetId: "ast_btc", symbol: "BTC", name: "Bitcoin", availableBalance: balances.BTC })],
    },
    orders: { ...s.orders, status: "ready" },
  })
}

const originalAdapter = http.defaults.adapter
const posted: InternalAxiosRequestConfig[] = []
function respondWith(status: number, data: unknown) {
  const adapter: AxiosAdapter = async (config) => {
    posted.push(config)
    const response = { data, status, statusText: "", headers: new AxiosHeaders(), config, request: {} }
    if (status >= 400) throw new AxiosError("fail", "ERR_BAD_REQUEST", config, {}, response)
    return response
  }
  http.defaults.adapter = adapter
}

beforeEach(() => {
  replace.mockClear()
  posted.length = 0
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  http.defaults.adapter = originalAdapter
})

describe("protected routes", () => {
  test("signed-out visitors are sent to login with a return path", async () => {
    pathname = "/wallet"
    render(
      <Provider store={storeWith("unauthenticated")}>
        <RequireAuth>
          <p>secret balances</p>
        </RequireAuth>
      </Provider>,
    )
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fwallet"))
    expect(screen.queryByText("secret balances")).toBeNull()
  })

  test("nothing redirects while the session is still being checked", () => {
    render(
      <Provider store={storeWith("unknown")}>
        <RequireAuth>
          <p>secret balances</p>
        </RequireAuth>
      </Provider>,
    )
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Checking your session")).toBeTruthy()
  })

  test("signed-in users see the page", () => {
    render(
      <Provider store={storeWith("authenticated")}>
        <RequireAuth>
          <p>secret balances</p>
        </RequireAuth>
      </Provider>,
    )
    expect(screen.getByText("secret balances")).toBeTruthy()
  })
})

describe("theme", () => {
  const ui = () => (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <ThemeToggle />
      </TooltipProvider>
    </ThemeProvider>
  )

  test("toggling persists the choice and survives a reload", async () => {
    const first = render(ui())
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
    fireEvent.click(screen.getByRole("button", { name: "Toggle colour theme" }))
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("light"))
    expect(document.documentElement.classList.contains("light")).toBe(true)
    first.unmount()
    document.documentElement.className = ""
    render(ui())
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true))
  })
})

describe("order form", () => {
  const mount = (store: Store, market = BTCUSDC) =>
    render(
      <Provider store={store}>
        <TooltipProvider>
          <TerminalProvider market={market}>
            <OrderForm />
          </TerminalProvider>
        </TooltipProvider>
      </Provider>,
    )

  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  test("validates tick size and shows what the order will lock", () => {
    mount(storeWith("authenticated"))
    type("Price", "65000.015")
    expect(screen.getByText("Price must be a multiple of 0.01")).toBeTruthy()
    type("Price", "65000")
    type("Amount", "0.001")
    expect(screen.getByText("65.13 USDC")).toBeTruthy() // price × qty × (1 + max fee)
    expect(screen.getByText("65.00 USDC")).toBeTruthy() // order value
  })

  test("placing an order results in a Pending order, not an execution", async () => {
    const store = storeWith("authenticated")
    respondWith(202, {
      success: true,
      message: "Order accepted",
      statusCode: 202,
      data: {
        order: { orderId: "ord_new", symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", price: "65000", quantity: "0.001", executedQuantity: "0", remainingQuantity: "0.001", averagePrice: null, timeInForce: "GTC", postOnly: false, status: "PENDING", createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z" },
        reserved: { assetId: "ast_usdc", amount: "65.13" },
      },
    })
    mount(store)
    type("Price", "65000")
    type("Amount", "0.001")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Buy BTC" }))
    })
    await waitFor(() => expect(store.getState().orders.open).toHaveLength(1))
    expect(JSON.parse(posted[0]!.data as string)).toEqual({ symbol: "BTCUSDC", side: "BUY", orderType: "LIMIT", quantity: "0.001", price: "65000", timeInForce: "GTC", postOnly: false })
    const o = store.getState().orders.open[0]!
    expect(o.status).toBe("PENDING")
    expect(o.executedQuantity).toBe("0")
    // Balances are not touched by the frontend; they change only on balance.updated.
    expect(store.getState().wallet.assets[0]!.availableBalance).toBe("1000")
  })

  test("the backend's error message is shown", async () => {
    respondWith(400, { success: false, data: null, message: "Insufficient available balance", errors: [{ code: "INSUFFICIENT_BALANCE" }] })
    mount(storeWith("authenticated"))
    type("Price", "65000")
    type("Amount", "0.001")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Buy BTC" }))
    })
    await waitFor(() => expect(screen.getByText("Insufficient available balance")).toBeTruthy())
  })

  test("market buy is blocked with an explanation; market sell is allowed", () => {
    mount(storeWith("authenticated", { USDC: "1000", BTC: "1" }))
    fireEvent.click(screen.getByRole("radio", { name: "Market" }))
    expect(screen.getByText(/Market buy orders are not supported yet/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Buy BTC" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Sell" }))
    expect((screen.getByRole("button", { name: "Sell BTC" }) as HTMLButtonElement).disabled).toBe(false)
  })

  test("halted markets cannot take orders", () => {
    mount(storeWith("authenticated"), { ...BTCUSDC, status: "HALTED" })
    expect((screen.getByRole("button", { name: "Buy BTC" }) as HTMLButtonElement).disabled).toBe(true)
  })

  test("signed-out visitors are asked to log in", () => {
    pathname = "/trade/BTCUSDC"
    mount(storeWith("unauthenticated"))
    expect(screen.getByRole("link", { name: "Log in to trade" }).getAttribute("href")).toBe("/login?next=%2Ftrade%2FBTCUSDC")
  })
})

describe("routes", () => {
  const app = join(import.meta.dir, "..", "app")
  const pages = [
    "(landing)/page.tsx",
    "(site)/markets/page.tsx",
    "(site)/markets/[symbol]/page.tsx",
    "(site)/fees/page.tsx",
    "(site)/status/page.tsx",
    "(auth)/login/page.tsx",
    "(auth)/register/page.tsx",
    "(auth)/forgot-password/page.tsx",
    "auth/success/page.tsx",
    "trade/page.tsx",
    "trade/[symbol]/page.tsx",
    "(app)/dashboard/page.tsx",
    "(app)/wallet/page.tsx",
    "(app)/wallet/deposit/page.tsx",
    "(app)/wallet/deposits/[depositId]/page.tsx",
    "(app)/wallet/withdraw/page.tsx",
    "(app)/wallet/history/page.tsx",
    "(app)/orders/page.tsx",
    "(app)/orders/history/page.tsx",
    "(app)/orders/trades/page.tsx",
    "(app)/orders/[orderId]/page.tsx",
    "(app)/account/page.tsx",
    "(app)/account/security/page.tsx",
    "(app)/account/notifications/page.tsx",
    "(app)/account/preferences/page.tsx",
    "(app)/account/api-keys/page.tsx",
    "payment/razorpay/page.tsx",
  ]
  test.each(pages)("%s exists", (p) => {
    expect(existsSync(join(app, p))).toBe(true)
  })
})
