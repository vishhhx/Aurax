import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { ENV } from "../config/env";

import type { OrderBookSnapshot } from "../types/order";

const s3Client = new S3Client({
  region: ENV.S3_REGION,

  credentials: {
    accessKeyId: ENV.S3_ACCESS_KEY_ID,
    secretAccessKey: ENV.S3_SECRET_ACCESS_KEY,
  },
});

class S3Service {
  constructor(private readonly client: S3Client) {}

  async uploadFile(snapshot: OrderBookSnapshot): Promise<void> {
    const timestamp = new Date().toISOString();

    const key = `snapshots/${snapshot.symbol}/${timestamp}.json`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: ENV.S3_BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(snapshot),
        ContentType: "application/json",
      }),
    );
  }

  async getRecentSnapshot(symbol: string): Promise<OrderBookSnapshot | null> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: ENV.S3_BUCKET_NAME,
        Prefix: `snapshots/${symbol}/`,
      }),
    );

    if (!response.Contents || response.Contents.length === 0) {
      return null;
    }

    const latest = response.Contents.filter((object) => object.Key).sort(
      (a, b) =>
        (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
    )[0];

    if (!latest?.Key) {
      return null;
    }

    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: ENV.S3_BUCKET_NAME,
        Key: latest.Key,
      }),
    );

    if (!object.Body) {
      throw new Error(`Snapshot body missing: ${latest.Key}`);
    }

    const body = await object.Body.transformToString();

    return JSON.parse(body) as OrderBookSnapshot;
  }
}

export const s3Service = new S3Service(s3Client);
