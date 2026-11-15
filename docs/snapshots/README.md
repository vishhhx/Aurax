# Aurax UI snapshots

Screenshots of every route in `apps/web`, plus the trading-bot dashboards. Captured on 2026-11-16 from the local dev stack.

- **Data source:** the pages show dev data. While they were captured, 15 SOL/USDC bots were trading.
- **Signed-in pages:** captured as the dev bot user `solusdc-maker-01` (`[DEV BOT] SOLUSDC-MAKER-01`). Its balances, orders, fills and deposits come from the dev database, not a real person's account.
- **Capture size:** desktop shots are 1440 px wide and full page height. Mobile shots are 390 × 844 at 2× scale.

| Folder | Contents |
| --- | --- |
| [`01-public`](01-public) | Landing, markets, market detail, guest trading terminal, fees, status, 404 |
| [`02-auth`](02-auth) | Login, register, forgot password, and the guest redirects of `/auth/success` and `/payment/razorpay` |
| [`03-app`](03-app) | Every signed-in page: dashboard, terminal, wallet, orders, account |
| [`04-light-theme`](04-light-theme) | Dashboard, terminal, wallet and markets in the light theme |
| [`05-mobile`](05-mobile) | Landing, dashboard, terminal, wallet and orders on a phone |
| [`06-trading-bots`](06-trading-bots) | All 15 bot dashboards side by side, and each one on its own |

## Route coverage

| Route | Snapshot |
| --- | --- |
| `/` | `01-public/01-landing-hero`, `02-landing-full`, `03-landing-testimonial`; signed in: `03-app/01-landing-signed-in`; mobile: `05-mobile/01-landing` |
| `/markets` | `01-public/04-markets`, `03-app/19-markets-signed-in`, `04-light-theme/04-markets` |
| `/markets/[symbol]` | `01-public/05-market-detail-solusdc`, `06-market-detail-btcusdc` |
| `/trade` | `01-public/08-trade-index` (opens the default market, BTC/USDC) |
| `/trade/[symbol]` | guest: `01-public/07-trade-solusdc-guest`; signed in: `03-app/03-trade-solusdc` (your orders marked in purple), `04-trade-btcusdc`; light: `04-light-theme/02`; mobile: `05-mobile/03` |
| `/fees` | `01-public/09-fees` |
| `/status` | `01-public/10-status` |
| not found | `01-public/11-not-found` |
| `/login` | `02-auth/01-login` |
| `/register` | `02-auth/02-register` |
| `/forgot-password` | `02-auth/03-forgot-password` |
| `/auth/success` | guest goes to `/login` (`02-auth/04`); signed in goes to `/dashboard` (`03-app/21`) |
| `/payment/razorpay` | needs a Razorpay order. Guest goes to `/login` (`02-auth/05`); signed in goes to `/wallet/deposit` (`03-app/20`) |
| `/dashboard` | `03-app/02-dashboard`, `04-light-theme/01-dashboard`, `05-mobile/02-dashboard` |
| `/wallet` | `03-app/05-wallet`, `04-light-theme/03-wallet`, `05-mobile/04-wallet` |
| `/wallet/deposit` | `03-app/06-wallet-deposit` |
| `/wallet/deposits/[depositId]` | `03-app/07-wallet-deposit-detail` |
| `/wallet/withdraw` | `03-app/08-wallet-withdraw` |
| `/wallet/history` | `03-app/09-wallet-history` |
| `/orders` | `03-app/10-orders-open`, `05-mobile/05-orders` |
| `/orders/history` | `03-app/11-orders-history` |
| `/orders/trades` | `03-app/12-orders-trades` |
| `/orders/[orderId]` | `03-app/13-order-detail` |
| `/account` | `03-app/14-account` |
| `/account/security` | `03-app/15-account-security` |
| `/account/notifications` | `03-app/16-account-notifications` |
| `/account/preferences` | `03-app/17-account-preferences` |
| `/account/api-keys` | `03-app/18-account-api-keys` |

## Trading bots

`06-trading-bots/00-all-bots-grid.png` shows 15 bots trading SOL/USDC at once: 8 makers, 2 liquidity bots and 5 takers. Files `01`–`15` show each dashboard on its own.

To capture these frames, start the bots with `AURAX_BOT_FRAME_DIR=<dir>`. Each bot then writes its latest dashboard frame to `<dir>/<bot-id>.ansi` once per second (see `apps/trading-bots/src/bot.ts`). Without that variable the bots behave as normal.
