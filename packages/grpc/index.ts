import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";

export function loadWalletProto(): grpc.GrpcObject {
  const protoPath = path.join(__dirname, "proto", "wallet.proto");

  const packageDefinition = protoLoader.loadSync(protoPath);

  return grpc.loadPackageDefinition(packageDefinition);
}
