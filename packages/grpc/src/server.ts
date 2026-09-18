import * as grpc from "@grpc/grpc-js";

export const getGrpcServer = (): Promise<grpc.Server> => {
  const grpcServer = new grpc.Server();

  return new Promise((resolve, reject) => {
    grpcServer.bindAsync(
      process.env.WALLET_GRPC_URL!,
      grpc.ServerCredentials.createInsecure(),
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        console.log(`gRPC server running on ${process.env.WALLET_GRPC_URL}`);

        resolve(grpcServer);
      },
    );
  });
};
