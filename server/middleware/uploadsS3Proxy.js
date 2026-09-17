/**
 * The frontend apps build image/PDF URLs like "/uploads/pan/<file>" straight
 * from what's stored in kyc_master_details.*_path columns — that never
 * changed. This middleware, mounted at app.use("/uploads", ...), transparently
 * serves those same URLs from S3 now instead of local disk: it maps the
 * request path to an S3 key (s3KeyForLocalPath), streams the object if
 * found, and calls next() otherwise so express.static can still serve
 * anything not migrated (pre-migration leftovers, seeded stamp-paper scans).
 */
import path from "node:path";
import { s3KeyForLocalPath, downloadBufferFromS3, isS3Configured } from "../services/s3StorageService.js";

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

export async function uploadsS3Proxy(request, response, next) {
  if (!isS3Configured()) return next();

  const localPath = `uploads${request.path}`;
  const key = s3KeyForLocalPath(localPath);
  if (!key) return next();

  const buffer = await downloadBufferFromS3(key);
  if (!buffer) return next();

  const ext = path.extname(request.path).toLowerCase();
  response.setHeader("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");
  return response.status(200).send(buffer);
}
