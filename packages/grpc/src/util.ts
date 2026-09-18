import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";

export async function loadProto<T>(contract: string): Promise<T> {
  const protoPath = path.join(__dirname, "..", "proto", `${contract}.proto`);

  const packageDefinition = await protoLoader.load(protoPath, {
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  return grpc.loadPackageDefinition(packageDefinition) as unknown as T;
}
