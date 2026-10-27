import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { ENV } from "../config/env";

import type { OrderBookSnapshot } from "../types/order";

/** Where order-book snapshots are persisted. */
export interface SnapshotStore {
  uploadFile(snapshot: OrderBookSnapshot): Promise<void>;
  getRecentSnapshot(symbol: string): Promise<OrderBookSnapshot | null>;
}

const snapshotName = () => `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

class S3SnapshotStore implements SnapshotStore {
  private readonly client = new S3Client({
    region: ENV.S3_REGION,
    credentials: {
      accessKeyId: ENV.S3_ACCESS_KEY_ID,
      secretAccessKey: ENV.S3_SECRET_ACCESS_KEY,
    },
  });

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

    const latest = response.Contents?.filter((o) => o.Key)
      .sort((a, b) => (a.Key! < b.Key! ? 1 : -1))
      .at(0);

    if (!latest?.Key) return null;

    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: ENV.S3_BUCKET_NAME,
        Key: latest.Key,
      }),
    );

    if (!object.Body) {
      throw new Error(`Snapshot body missing: ${latest.Key}`);
    }

    return JSON.parse(await object.Body.transformToString()) as OrderBookSnapshot;
  }
}

/**
 * Local-disk store for development and isolated test environments. Writes are
 * atomic (temp file + rename) so a crash never leaves a torn snapshot.
 */
class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly dir: string) {}

  async uploadFile(snapshot: OrderBookSnapshot): Promise<void> {
    const dir = join(this.dir, snapshot.symbol);
    await mkdir(dir, { recursive: true });
    const file = join(dir, snapshotName());
    await writeFile(`${file}.tmp`, JSON.stringify(snapshot));
    await rename(`${file}.tmp`, file);
  }

  async getRecentSnapshot(symbol: string): Promise<OrderBookSnapshot | null> {
    const dir = join(this.dir, symbol);
    const files = await readdir(dir).catch(() => [] as string[]);
    const latest = files.filter((f) => f.endsWith(".json")).sort().at(-1);
    if (!latest) return null;
    return JSON.parse(await readFile(join(dir, latest), "utf8")) as OrderBookSnapshot;
  }
}

export const s3Service: SnapshotStore =
  ENV.SNAPSHOT_STORE === "fs" ? new FileSnapshotStore(ENV.SNAPSHOT_DIR) : new S3SnapshotStore();
