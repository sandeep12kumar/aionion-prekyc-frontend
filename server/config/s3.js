import { S3Client } from "@aws-sdk/client-s3";

const REQUIRED_ENV = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_S3_BUCKET"];

export function isS3Configured() {
  return REQUIRED_ENV.every((name) => Boolean(process.env[name]));
}

let client = null;

/** Lazily built, reused S3Client. Throws a clear error if AWS_* env vars aren't set. */
export function getS3Client() {
  if (!isS3Configured()) {
    throw new Error(
      "AWS S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION and AWS_S3_BUCKET in server/.env.",
    );
  }
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export const getS3Bucket = () => process.env.AWS_S3_BUCKET;

// The DDPI stamp-paper scans live in a SEPARATE bucket from client uploads
// (seeded reference assets, not something a client ever uploads) — same AWS
// account/credentials/region, different bucket.
export const getStampPapersBucket = () => process.env.AWS_S3_STAMP_PAPERS_BUCKET;
