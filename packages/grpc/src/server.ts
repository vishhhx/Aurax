import * as grpc from "@grpc/grpc-js";

/**
 * Creates a gRPC server bound to `address` (`host:port`). Each service passes
 * its own bind address; previously every caller bound `WALLET_GRPC_URL`.
 */
export const getGrpcServer = (address: string): Promise<grpc.Server> => {
  if (!address) {
    return Promise.reject(new Error("getGrpcServer: bind address is required"));
  }

  const grpcServer = new grpc.Server();

  return new Promise((resolve, reject) => {
    grpcServer.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error) => {
      if (error) {
        reject(new Error(`gRPC server failed to bind ${address}: ${error.message}`));
        return;
      }
      console.log(`gRPC server running on ${address}`);
      resolve(grpcServer);
    });
  });
};
