import { SocketRepository } from "../utils/redis";
import { getGlobalIO } from "../utils/socketManager";

export interface DepositCompletedEvent {
  event: "deposit.completed";
  userId: string;
  depositId: string;
  assetId: string;
  amount: string;
  balance: string;
  timestamp: string;
}

export const handleDepositCompleted = async (event: DepositCompletedEvent) => {
  const io = getGlobalIO();
  const socketRepo = new SocketRepository();
  const sockets = await socketRepo.get(event.userId);

  if (!sockets.length) {
    return;
  }
  for (const socketId of sockets) {
    io.to(socketId).emit("deposit.completed", {
      depositId: event.depositId,
      assetId: event.assetId,
      amount: event.amount,
      balance: event.balance,
    });
  }
};
