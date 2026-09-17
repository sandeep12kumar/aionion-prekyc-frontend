/**
 * All client-uploaded/generated documents live in S3 under this exact
 * structure (as specified):
 *
 *   aionion-kyc-prekyc-document/
 *   └── Client/
 *       └── Uploads/
 *           ├── aadhaar_xml/
 *           ├── panimage/
 *           ├── livephoto/                (IPV still photo AND video — no
 *           |                              separate video folder was given)
 *           ├── signature/
 *           │   ├── capture_signature/     (not used yet — no camera-capture
 *           │   |                          signature flow exists today)
 *           │   ├── upload_singature/      (the only signature method today:
 *           │   |                          a plain file upload in the RM app)
 *           │   └── singature_pad/         (not used yet — no draw-pad flow
 *           |                              exists today)
 *           ├── esigned_pdf/
 *           └── unsigned_pdf/
 *
 * kyc_master_details.*_path columns keep storing the SAME local-style value
 * they always have (e.g. "/uploads/pan/<file>") — no DB/schema change, and
 * the RM/client frontends keep building <img src="/uploads/..."> exactly as
 * before. s3KeyForLocalPath() below is the one place that maps that stored
 * value to its S3 object key, used by every read path (the /uploads proxy
 * route, the KYC PDF's image embedding, the signed-PDF stream, the
 * completion email attachment) and by the one-time migration script.
 */
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getS3Bucket, getStampPapersBucket, isS3Configured } from "../config/s3.js";

export { isS3Configured };

const ROOT = "Client/Uploads";

export const S3_FOLDERS = {
  pan: `${ROOT}/panimage`,
  signatureUpload: `${ROOT}/signature/upload_singature`,
  livePhoto: `${ROOT}/livephoto`,
  esignedPdf: `${ROOT}/esigned_pdf`,
  unsignedPdf: `${ROOT}/unsigned_pdf`,
  aadhaarXml: `${ROOT}/aadhaar_xml`,
};

// Ordered by local path prefix -> S3 folder. IPV photos and videos share the
// livephoto/ folder (the given structure has no separate video folder);
// their random filenames + differing extensions keep them from colliding.
const READ_MAPPING = [
  { localPrefix: "uploads/pan/", folder: S3_FOLDERS.pan },
  { localPrefix: "uploads/signature/", folder: S3_FOLDERS.signatureUpload },
  { localPrefix: "uploads/ipv/images/", folder: S3_FOLDERS.livePhoto },
  { localPrefix: "uploads/ipv/videos/", folder: S3_FOLDERS.livePhoto },
  { localPrefix: "uploads/esign-signed/", folder: S3_FOLDERS.esignedPdf },
  { localPrefix: "uploads/aadhaar-xml/", folder: S3_FOLDERS.aadhaarXml },
];

/**
 * Map a stored local-style path ("/uploads/pan/<file>", as already sitting
 * in kyc_master_details.*_path columns) to its S3 object key. Returns null
 * for anything not part of this migration (e.g. /uploads/stamp-papers/...,
 * which is a seeded reference asset, not a client upload, and stays local).
 */
export function s3KeyForLocalPath(localPath) {
  const clean = String(localPath || "").replace(/^\/+/, "");
  for (const { localPrefix, folder } of READ_MAPPING) {
    if (clean.startsWith(localPrefix)) {
      const fileName = clean.slice(localPrefix.length);
      return fileName ? `${folder}/${fileName}` : null;
    }
  }
  return null;
}

/** Upload a buffer to S3 under one of S3_FOLDERS (or an explicit bucket), returning its key. */
export async function uploadBufferToS3(folder, fileName, buffer, contentType, bucket = getS3Bucket()) {
  const key = `${folder}/${fileName}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return key;
}

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

/** Download an S3 object as a Buffer, or null if it doesn't exist / S3 isn't configured. */
export async function downloadBufferFromS3(key, bucket = getS3Bucket()) {
  if (!key || !bucket || !isS3Configured()) return null;
  try {
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await streamToBuffer(result.Body);
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
    console.error(`[s3] download failed for key "${key}" in bucket "${bucket}":`, error.message);
    return null;
  }
}

/** Best-effort: resolve a stored local-style path straight to its S3 bytes, or null. */
export async function readUploadFromS3(localPath) {
  const key = s3KeyForLocalPath(localPath);
  if (!key) return null;
  return downloadBufferFromS3(key);
}

// DDPI stamp-paper scans: a separate bucket, folder "stamp_papers/Stamp paper/",
// keyed by filename only — stamp_paper_master.image_path stores a local-style
// path like "/uploads/stamp-papers/DPDI-STAMP PAPER0.jpg"; only the basename
// carries over into the S3 key.
export const STAMP_PAPER_S3_FOLDER = "stamp_papers/Stamp paper";

/** Best-effort: fetch a DDPI stamp-paper scan from its own S3 bucket, or null. */
export async function downloadStampPaperFromS3(imagePath) {
  const fileName = String(imagePath || "").split(/[/\\]/).pop();
  if (!fileName) return null;
  return downloadBufferFromS3(`${STAMP_PAPER_S3_FOLDER}/${fileName}`, getStampPapersBucket());
}
