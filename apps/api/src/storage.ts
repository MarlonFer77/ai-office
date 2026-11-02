import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from './env.js';

/** S3-compatible object storage (MinIO locally). Optional: features degrade gracefully. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType?: string }>;
}

export function createStorage(env: Env): ObjectStorage | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  const client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const Bucket = env.S3_BUCKET;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      const bytes = await out.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), ...(out.ContentType ? { contentType: out.ContentType } : {}) };
    },
  };
}
