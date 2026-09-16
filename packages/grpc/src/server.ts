import * as grpc from "@grpc/grpc-js";
let GrpcServer: grpc.Server;
export const startGrpcServer = (): Promise<void> => {
  GrpcServer = new grpc.Server();
  return new Promise((resolve, reject) => {
    GrpcServer.bindAsync(
      process.env.WALLET_GRPC_URL!,
      grpc.ServerCredentials.createInsecure(),
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        console.log(`gRPC server running on ${process.env.WALLET_GRPC_URL}`);

        resolve();
      },
    );
  });
};

export const getGrpcServer = (): grpc.Server => {
  if (!GrpcServer) {
    throw new Error(
      "gRPC server not started yet. Call startGrpcServer() first.",
    );
  }
  return GrpcServer;
};
