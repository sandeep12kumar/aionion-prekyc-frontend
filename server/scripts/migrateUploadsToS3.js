/**
 * One-time migration: upload every file already sitting under server/uploads/
 * (from before this app moved to S3) into the matching S3 folder.
 *
 * No database changes — kyc_master_details.*_path columns already store
 * "/uploads/..." values, and the app now resolves those through S3 first
 * (see s3StorageService.js / middleware/uploadsS3Proxy.js), so this script
 * only needs to make sure the bytes exist in S3 under the right key; nothing
 * in the DB needs to change.
 *
 * Run from server/: node scripts/migrateUploadsToS3.js
 * Requires AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION /
 * AWS_S3_BUCKET to already be set in server/.env.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { S3_FOLDERS, STAMP_PAPER_S3_FOLDER, uploadBufferToS3, isS3Configured } from "../services/s3StorageService.js";
import { getS3Bucket, getStampPapersBucket } from "../config/s3.js";

const UPLOADS_ROOT = path.resolve("uploads");

// Local directory -> S3 folder, mirroring server/services/s3StorageService.js's
// READ_MAPPING. IPV photos and videos both land in livephoto/ per the given
// S3 structure (no separate video folder was specified).
const DIRECTORIES = [
  { local: path.join(UPLOADS_ROOT, "pan"), folder: S3_FOLDERS.pan },
  { local: path.join(UPLOADS_ROOT, "signature"), folder: S3_FOLDERS.signatureUpload },
  { local: path.join(UPLOADS_ROOT, "ipv", "images"), folder: S3_FOLDERS.livePhoto },
  { local: path.join(UPLOADS_ROOT, "ipv", "videos"), folder: S3_FOLDERS.livePhoto },
  { local: path.join(UPLOADS_ROOT, "esign-signed"), folder: S3_FOLDERS.esignedPdf },
  { local: path.join(UPLOADS_ROOT, "aadhaar-xml"), folder: S3_FOLDERS.aadhaarXml },
  // DDPI stamp-paper scans go to a SEPARATE bucket (seeded reference assets,
  // not a client upload) — see s3StorageService.js / config/s3.js.
  { local: path.join(UPLOADS_ROOT, "stamp-papers"), folder: STAMP_PAPER_S3_FOLDER, bucket: getStampPapersBucket() },
];

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".xml": "application/xml",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

async function migrateDirectory({ local, folder, bucket = getS3Bucket() }) {
  if (!fs.existsSync(local)) {
    console.log(`  (skip) ${local} — doesn't exist`);
    return { uploaded: 0, failed: 0 };
  }

  const files = fs.readdirSync(local).filter((name) => fs.statSync(path.join(local, name)).isFile());
  let uploaded = 0;
  let failed = 0;

  for (const fileName of files) {
    try {
      const buffer = fs.readFileSync(path.join(local, fileName));
      const contentType = CONTENT_TYPES[path.extname(fileName).toLowerCase()] || "application/octet-stream";
      await uploadBufferToS3(folder, fileName, buffer, contentType, bucket);
      uploaded += 1;
    } catch (error) {
      failed += 1;
      console.error(`  FAILED ${path.join(local, fileName)}:`, error.message);
    }
  }

  console.log(`  ${local} -> s3://${bucket}/${folder}/  (${uploaded} uploaded, ${failed} failed, ${files.length} total)`);
  return { uploaded, failed };
}

async function main() {
  if (!isS3Configured()) {
    console.error(
      "AWS S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION and AWS_S3_BUCKET in server/.env first.",
    );
    process.exit(1);
  }

  console.log("Migrating server/uploads/ -> S3...\n");
  let totalUploaded = 0;
  let totalFailed = 0;

  for (const dir of DIRECTORIES) {
    const { uploaded, failed } = await migrateDirectory(dir);
    totalUploaded += uploaded;
    totalFailed += failed;
  }

  console.log(`\nDone — ${totalUploaded} file(s) uploaded, ${totalFailed} failed.`);
  if (totalFailed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Migration script crashed:", error);
  process.exit(1);
});
