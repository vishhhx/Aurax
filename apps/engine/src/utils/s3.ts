import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { ENV } from "../config/env";
import type { OrderBookSnapshot } from "../orderbook/order";

const s3Client = new S3Client({
  region: ENV.S3_REGION,

  credentials: {
    accessKeyId: ENV.S3_ACCESS_KEY_ID,
    secretAccessKey: ENV.S3_SECRET_ACCESS_KEY,
  },
});

class S3Service {
  private client: S3Client;

  constructor(client: S3Client) {
    this.client = client;
  }

  async uploadFile(snapshot: OrderBookSnapshot): Promise<void> {
    const timestamp = new Date().toISOString();

    const key = `snapshots/${snapshot.symbol}/${timestamp}.json`;

    const command = new PutObjectCommand({
      Bucket: ENV.S3_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(snapshot),
      ContentType: "application/json",
    });

    await this.client.send(command);
  }

  async getRecentSnapshot(symbol: string): Promise<OrderBookSnapshot | null> {
    const command = new ListObjectsV2Command({
      Bucket: ENV.S3_BUCKET_NAME,
      Prefix: `snapshots/${symbol}/`,
    });

    const response = await this.client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      return null;
    }

    const latestObject = response.Contents.filter((object) => object.Key).sort(
      (a, b) =>
        (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
    )[0]; //Todo:optimization:we are bringing all ids to get the latest One

    if (!latestObject?.Key) {
      return null;
    }

    const getCommand = new GetObjectCommand({
      Bucket: ENV.S3_BUCKET_NAME,
      Key: latestObject.Key,
    });

    const object = await this.client.send(getCommand);

    if (!object.Body) {
      throw new Error(`Snapshot body is empty: ${latestObject.Key}`);
    }

    const body = await object.Body.transformToString();

    return JSON.parse(body) as OrderBookSnapshot;
  }
}

export const s3Service = new S3Service(s3Client);
