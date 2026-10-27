# Aurax Bot Lab (dev-only)

Multi-bot integration harness that drives the real Aurax stack (gateway → order-service → engine → market-service → websockets).

```bash
cp apps/trading-bots/.env.example apps/trading-bots/.env   # set AURAX_DEV_JWT_SECRET = local JWT_ACCESS_SECRET
npm run dev             # (repo root) backend services — bots are excluded
cd apps/trading-bots && npm run dev   # controller (only runs from here)
npm run seed           # re-provision/fund the saved plan (no trading)
npm run cancel-all     # cancel every bot order (safety net)
npm test
```

- **Auth**: bots are Mongo `AuthModel` users `<bot-id>@bots.aurax.dev` (name `[DEV BOT] …`, unusable password). Bots mint 10-minute access tokens with the *local* dev JWT secret. Refuses `NODE_ENV=production` and non-localhost backends.
- **Funding**: `deposit → wallet → ledger → walletTransaction → outbox` in one transaction, mirroring `DepositRepository.completePayment`; network `DEV-BOT-FAUCET`, orderId `devbot:<bot>:<asset>:<round>`. Only the shortfall to budget is credited.
- **Processes**: one per bot, in gnome-terminal/kitty/alacritty/… windows, else tmux (`aurax-bots`), else background. `BOT_TERMINAL=window|tmux|background` forces it. State lives in `.state/` (plan, run files, logs, `KILL` switch).
- **Safety**: dry-run by default, post-only makers, IOC-limit takers, per-order/session notional caps, max open orders, inventory cap, cooldown, no retry of ambiguous submits (reconciled via order history), cancel-on-exit.
- **Empty markets**: makers quote only off mid / last trade / best side, or an operator-entered anchor price asked for when a market has no book and no trades.
