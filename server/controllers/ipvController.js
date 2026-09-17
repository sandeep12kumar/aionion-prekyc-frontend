import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "../config/database.js";
import { resolveKycId } from "../utils/kycMaster.js";
import { S3_FOLDERS, uploadBufferToS3 } from "../services/s3StorageService.js";

/**
 * POST /api/kyc/leads/:id/ipv
 * multipart:
 *   ipvPhoto   (image/jpeg)              — a still frame pulled from the video, required; reused in the PDF step
 *   ipvCapture (video/webm|video/mp4)    — the 5-second liveness video, optional but normally sent
 *   latitude, longitude, accuracy, capturedAt — location grabbed at the same time
 */
export async function uploadIpvCaptureController(request, response, next) {
  const video = request.files?.ipvCapture?.[0] || null;
  const photo = request.files?.ipvPhoto?.[0] || null;

  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) {
      return response.status(400).json({ message: "A valid application is required." });
    }

    if (!photo) {
      return response.status(400).json({ message: "The IPV face photo is missing." });
    }

    const latitude = request.body.latitude !== undefined ? Number(request.body.latitude) : null;
    const longitude = request.body.longitude !== undefined ? Number(request.body.longitude) : null;
    const accuracyRaw = request.body.accuracy !== undefined ? Number(request.body.accuracy) : null;
    const accuracy = accuracyRaw === null || Number.isNaN(accuracyRaw) ? null : accuracyRaw;

    if (latitude === null || longitude === null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return response.status(400).json({ message: "Location (latitude/longitude) is required for IPV." });
    }

    // Both photo and video land in the same S3 livephoto/ folder (the given
    // structure has no separate video folder) — random filenames + differing
    // extensions keep them from colliding.
    const photoFileName = `${randomUUID()}${path.extname(photo.originalname) || ".jpg"}`;
    await uploadBufferToS3(S3_FOLDERS.livePhoto, photoFileName, photo.buffer, photo.mimetype);
    const photoPath = `/uploads/ipv/images/${photoFileName}`;

    let videoPath = null;
    if (video) {
      const videoFileName = `${randomUUID()}${path.extname(video.originalname) || ".webm"}`;
      await uploadBufferToS3(S3_FOLDERS.livePhoto, videoFileName, video.buffer, video.mimetype);
      videoPath = `/uploads/ipv/videos/${videoFileName}`;
    }

    const capturedAt = request.body.capturedAt ? new Date(request.body.capturedAt) : new Date();

    const result = await pool.query(
      `UPDATE kyc_master_details SET
        ipv_photo_path = $2, ipv_video_path = COALESCE($3, ipv_video_path),
        ipv_latitude = $4, ipv_longitude = $5, ipv_location_accuracy = $6, ipv_capture_at = $7,
        current_stage = 'esign', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, ipv_photo_path, ipv_video_path, ipv_capture_at`,
      [kycId, photoPath, videoPath, latitude, longitude, accuracy, capturedAt],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ message: "Application not found." });
    }

    return response.status(200).json({
      ipv: {
        photoPath: result.rows[0].ipv_photo_path,
        videoPath: result.rows[0].ipv_video_path,
        capturedAt: result.rows[0].ipv_capture_at,
      },
    });
  } catch (error) {
    return next(error);
  }
}
