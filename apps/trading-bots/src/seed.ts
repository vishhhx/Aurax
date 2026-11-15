/**
 * Bot provisioning, kept apart from trading: creates the dev bot users and funds
 * them through the same deposit → wallet → ledger → outbox path the Razorpay
 * webhook uses (wallet-service DepositRepository.completePayment). Never trades.
 *
 * Idempotent: users are looked up by their dev email and never modified once
 * they exist; a deposit is only created for the shortfall between the bot's
 * budget and its current (available + locked) balance, under a deterministic
 * orderId, so reruns and concurrent runs credit at most once.
 */
import { AuthModel, connectMongoDb } from "@repo/database";
import { TOPICS } from "@repo/kafka";
import { DepositStatus, enqueueBalanceUpdates, enqueueOutbox, LedgerEntryType, LedgerReferenceType, prisma, WalletTransactionStatus, WalletTransactionType } from "@repo/pg";
import { assertDevOnly, loadPlan, type BotDef, type Plan } from "./lib/config";

export const DEV_EMAIL_DOMAIN = "bots.aurax.dev";
const DEV_NETWORK = "DEV-BOT-FAUCET";

export interface SeedResult {
  bot: string;
  ok: boolean;
  created: boolean;
  funded: string[];
  error?: string;
}

async function ensureUser(bot: BotDef): Promise<{ userId: string; email: string; created: boolean }> {
  const email = `${bot.id}@${DEV_EMAIL_DOMAIN}`;
  const existing = await AuthModel.findOne({ email });
  if (existing) return { userId: existing._id.toString(), email, created: false };
  const user = await AuthModel.create({
    email,
    name: `[DEV BOT] ${bot.name}`,
    provider: "local",
    passwordHash: "!dev-bot:no-password-login", // not a valid hash: cannot be used to log in
    lastLogin: new Date(),
  });
  return { userId: user._id.toString(), email, created: true };
}

async function fund(userId: string, botId: string, symbol: string, target: string): Promise<string | null> {
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) throw new Error(`asset ${symbol} not found`);
  const wallet = await prisma.wallet.findUnique({ where: { userId_assetId: { userId, assetId: asset.assetId } } });
  const have = wallet ? wallet.availableBalance.add(wallet.lockedBalance) : null;
  const deficit = have ? have.neg().add(target) : target;
  if (Number(deficit.toString()) <= 0) return null;

  const round = await prisma.deposit.count({ where: { userId, assetId: asset.assetId, network: DEV_NETWORK } });
  // userId is part of the key: if a bot's auth user is recreated (new Mongo), its
  // deposits must not collide with the old user's completed ones and be silently skipped.
  const orderId = `devbot:${botId}:${userId}:${symbol}:${round}`;
  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.upsert({
      where: { orderId },
      update: {},
      create: { userId, assetId: asset.assetId, amount: deficit, orderId, network: DEV_NETWORK, status: DepositStatus.PENDING },
    });
    const claimed = await tx.deposit.updateMany({
      where: { depositId: deposit.depositId, status: DepositStatus.PENDING },
      data: { status: DepositStatus.COMPLETED, completedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    const w = await tx.wallet.upsert({
      where: { userId_assetId: { userId, assetId: asset.assetId } },
      update: { availableBalance: { increment: deposit.amount } },
      create: { userId, assetId: asset.assetId, availableBalance: deposit.amount, lockedBalance: 0 },
    });
    await tx.ledger.create({ data: { userId, assetId: asset.assetId, entryType: LedgerEntryType.CREDIT, amount: deposit.amount, referenceId: deposit.depositId, referenceType: LedgerReferenceType.DEPOSIT } });
    await tx.walletTransaction.create({ data: { userId, assetId: asset.assetId, amount: deposit.amount, type: WalletTransactionType.DEPOSIT, status: WalletTransactionStatus.SUCCESS, referenceId: deposit.depositId } });
    await enqueueOutbox(tx, [
      {
        topic: TOPICS.DEPOSIT_EVENTS,
        key: userId,
        payload: { eventId: `deposit.completed:${deposit.depositId}`, event: "deposit.completed", userId, depositId: deposit.depositId, assetId: asset.assetId, amount: deposit.amount.toFixed(), balance: w.availableBalance.toFixed(), timestamp: new Date().toISOString() },
      },
    ]);
    await enqueueBalanceUpdates(tx, TOPICS.NOTIFICATION_EVENTS, [{ userId, assetId: asset.assetId }], "DEPOSIT", deposit.depositId);
    return `${deposit.amount.toFixed()} ${symbol}`;
  });
}

/** Provision and fund every bot in the plan; mutates bot.userId/email. */
export async function seed(plan: Plan): Promise<SeedResult[]> {
  assertDevOnly();
  await connectMongoDb();
  const results: SeedResult[] = [];
  for (const bot of plan.bots) {
    try {
      const u = await ensureUser(bot);
      Object.assign(bot, { userId: u.userId, email: u.email });
      const funded = [await fund(u.userId, bot.id, bot.baseAsset, bot.budget.base), await fund(u.userId, bot.id, bot.quoteAsset, bot.budget.quote)];
      results.push({ bot: bot.name, ok: true, created: u.created, funded: funded.filter((f): f is string => !!f) });
    } catch (e) {
      results.push({ bot: bot.name, ok: false, created: false, funded: [], error: (e as Error).message });
    }
  }
  return results;
}

if (import.meta.main) {
  const plan = loadPlan();
  if (!plan) throw new Error("no bot plan yet: configure bots from the controller (npm run dev)");
  const { writeJson, PLAN_FILE } = await import("./lib/config");
  const res = await seed(plan);
  writeJson(PLAN_FILE, plan);
  console.table(res.map((r) => ({ bot: r.bot, ok: r.ok, newUser: r.created, funded: r.funded.join(", ") || "-", error: r.error ?? "" })));
  process.exit(res.every((r) => r.ok) ? 0 : 1);
}
