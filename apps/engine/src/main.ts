import { connectKafka } from "@repo/kafka";
import { ENV } from "./config/env";
import { consumeOrder } from "./consumers/order.consumer";
import { startGrpcServer } from "./grpc";
import { engine } from "./matching-engine";

export const StartEngine = async (markets: string[], workerIndex: number) => {
  await engine.load();
  await connectKafka();
  // gRPC starts before recovery: GetEngineStatus reports RECOVERY until caught up.
  const address = `${ENV.ENGINE_GRPC_HOST}:${ENV.ENGINE_GRPC_BASE_PORT + workerIndex}`;
  await startGrpcServer(address);
  console.log(`[Engine] worker ${workerIndex} serving ${markets.join(",")} on gRPC ${address}`);
  await consumeOrder(markets);
};
